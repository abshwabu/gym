<?php

namespace App\Services;

use App\Models\Member;
use App\Models\MemberWebAuthnCredential;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;
use RuntimeException;

class WebAuthnService
{
    private const CHALLENGE_TTL_SECONDS = 300;

    public function relyingPartyId(string $originHost): string
    {
        // Strip port for rpId (WebAuthn requires registrable domain / host without port).
        return explode(':', $originHost)[0];
    }

    public function createChallenge(string $purpose, ?string $memberId = null): string
    {
        $challenge = rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');

        Cache::put($this->challengeKey($challenge), [
            'purpose' => $purpose,
            'member_id' => $memberId,
            'created_at' => now()->toIso8601String(),
        ], self::CHALLENGE_TTL_SECONDS);

        return $challenge;
    }

    public function consumeChallenge(string $challenge, string $expectedPurpose, ?string $expectedMemberId = null): void
    {
        $key = $this->challengeKey($challenge);
        $payload = Cache::pull($key);

        if (!$payload) {
            throw new RuntimeException('Fingerprint challenge expired or already used. Please try again.');
        }

        if (($payload['purpose'] ?? null) !== $expectedPurpose) {
            throw new RuntimeException('Invalid fingerprint challenge purpose.');
        }

        if ($expectedMemberId !== null && ($payload['member_id'] ?? null) !== $expectedMemberId) {
            throw new RuntimeException('Fingerprint challenge does not match this member.');
        }
    }

    public function registrationOptions(Member $member, string $rpId, string $rpName): array
    {
        $challenge = $this->createChallenge('register', $member->id);
        $exclude = MemberWebAuthnCredential::where('member_id', $member->id)
            ->get(['credential_id'])
            ->map(fn ($cred) => [
                'type' => 'public-key',
                'id' => $cred->credential_id,
            ])
            ->values()
            ->all();

        return [
            'challenge' => $challenge,
            'rp' => [
                'name' => $rpName,
                'id' => $rpId,
            ],
            'user' => [
                'id' => $this->base64UrlEncode($member->id),
                'name' => trim($member->email ?: ($member->first_name.'.'.$member->last_name)),
                'displayName' => trim($member->first_name.' '.$member->last_name),
            ],
            'pubKeyCredParams' => [
                ['type' => 'public-key', 'alg' => -7],   // ES256
                ['type' => 'public-key', 'alg' => -257], // RS256
            ],
            'timeout' => 60000,
            'attestation' => 'none',
            'excludeCredentials' => $exclude,
            'authenticatorSelection' => [
                'authenticatorAttachment' => 'platform',
                'residentKey' => 'preferred',
                'requireResidentKey' => false,
                'userVerification' => 'preferred',
            ],
        ];
    }

    public function authenticationOptions(string $rpId, ?string $memberId = null): array
    {
        $challenge = $this->createChallenge('authenticate', $memberId);

        $query = MemberWebAuthnCredential::query()->select(['credential_id', 'transports']);
        if ($memberId) {
            $query->where('member_id', $memberId);
        }

        $allowCredentials = $query->get()->map(function ($cred) {
            $item = [
                'type' => 'public-key',
                'id' => $cred->credential_id,
            ];
            if ($cred->transports) {
                $item['transports'] = array_values(array_filter(explode(',', $cred->transports)));
            }
            return $item;
        })->values()->all();

        return [
            'challenge' => $challenge,
            'timeout' => 60000,
            'rpId' => $rpId,
            'allowCredentials' => $allowCredentials,
            'userVerification' => 'preferred',
        ];
    }

    /**
     * Persist a newly created platform authenticator credential for a member.
     *
     * @param  array{id: string, publicKey: string, clientDataJSON: string, transports?: array<int, string>|null, deviceName?: string|null}  $payload
     */
    public function finishRegistration(Member $member, array $payload, string $expectedOrigin, string $expectedRpId): MemberWebAuthnCredential
    {
        $clientData = $this->decodeClientData($payload['clientDataJSON']);
        $this->assertClientData($clientData, 'webauthn.create', $expectedOrigin);
        $this->consumeChallenge($clientData['challenge'], 'register', $member->id);

        $credentialId = $payload['id'];
        $publicKeyPem = $this->spkiToPem($payload['publicKey']);

        if (MemberWebAuthnCredential::where('credential_id', $credentialId)->exists()) {
            throw new RuntimeException('This fingerprint credential is already enrolled.');
        }

        return MemberWebAuthnCredential::create([
            'id' => (string) Str::uuid(),
            'member_id' => $member->id,
            'credential_id' => $credentialId,
            'public_key' => $publicKeyPem,
            'sign_count' => 0,
            'transports' => isset($payload['transports']) ? implode(',', $payload['transports']) : null,
            'device_name' => $payload['deviceName'] ?? 'Fingerprint reader',
        ]);
    }

    /**
     * Verify an assertion and return the matched credential (with member loaded).
     *
     * @param  array{id: string, clientDataJSON: string, authenticatorData: string, signature: string}  $payload
     */
    public function finishAuthentication(array $payload, string $expectedOrigin, string $expectedRpId): MemberWebAuthnCredential
    {
        $credential = MemberWebAuthnCredential::with('member')
            ->where('credential_id', $payload['id'])
            ->first();

        if (!$credential || !$credential->member) {
            throw new RuntimeException('No enrolled fingerprint matched. Ask the front desk to enroll one.');
        }

        $clientData = $this->decodeClientData($payload['clientDataJSON']);
        $this->assertClientData($clientData, 'webauthn.get', $expectedOrigin);
        $this->consumeChallenge($clientData['challenge'], 'authenticate');

        $authenticatorData = $this->base64UrlDecode($payload['authenticatorData']);
        $signature = $this->base64UrlDecode($payload['signature']);
        $clientDataHash = hash('sha256', $this->base64UrlDecode($payload['clientDataJSON']), true);
        $signedData = $authenticatorData.$clientDataHash;

        if (strlen($authenticatorData) < 37) {
            throw new RuntimeException('Invalid authenticator data from fingerprint reader.');
        }

        $rpIdHash = substr($authenticatorData, 0, 32);
        $expectedRpIdHash = hash('sha256', $expectedRpId, true);
        if (!hash_equals($expectedRpIdHash, $rpIdHash)) {
            throw new RuntimeException('Fingerprint authenticator rpId mismatch.');
        }

        $flags = ord($authenticatorData[32]);
        if (($flags & 0x01) !== 0x01) {
            throw new RuntimeException('Fingerprint user presence was not confirmed.');
        }

        $ok = openssl_verify($signedData, $signature, $credential->public_key, OPENSSL_ALGO_SHA256);
        if ($ok !== 1) {
            // Some authenticators return an IEEE P1363 ECDSA signature; convert to DER and retry.
            $derSignature = $this->p1363ToDer($signature);
            $ok = $derSignature
                ? openssl_verify($signedData, $derSignature, $credential->public_key, OPENSSL_ALGO_SHA256)
                : 0;
        }

        if ($ok !== 1) {
            throw new RuntimeException('Fingerprint signature verification failed.');
        }

        $signCount = unpack('N', substr($authenticatorData, 33, 4))[1];
        if ($signCount > 0 && $signCount <= $credential->sign_count) {
            throw new RuntimeException('Fingerprint authenticator sign count replay detected.');
        }

        $credential->update([
            'sign_count' => max($signCount, $credential->sign_count),
            'last_used_at' => now(),
        ]);

        return $credential->fresh('member');
    }

    private function challengeKey(string $challenge): string
    {
        return 'webauthn_challenge:'.hash('sha256', $challenge);
    }

    private function decodeClientData(string $clientDataJSON): array
    {
        $json = $this->base64UrlDecode($clientDataJSON);
        $data = json_decode($json, true);
        if (!is_array($data)) {
            throw new RuntimeException('Invalid WebAuthn client data.');
        }

        return $data;
    }

    private function assertClientData(array $clientData, string $expectedType, string $expectedOrigin): void
    {
        if (($clientData['type'] ?? null) !== $expectedType) {
            throw new RuntimeException('Unexpected WebAuthn ceremony type.');
        }

        $origin = rtrim((string) ($clientData['origin'] ?? ''), '/');
        $expected = rtrim($expectedOrigin, '/');
        if (!hash_equals($expected, $origin)) {
            throw new RuntimeException('WebAuthn origin mismatch. Use HTTPS or localhost.');
        }

        if (empty($clientData['challenge']) || !is_string($clientData['challenge'])) {
            throw new RuntimeException('Missing WebAuthn challenge in client data.');
        }
    }

    private function spkiToPem(string $base64UrlSpki): string
    {
        $der = $this->base64UrlDecode($base64UrlSpki);
        $b64 = chunk_split(base64_encode($der), 64, "\n");

        return "-----BEGIN PUBLIC KEY-----\n{$b64}-----END PUBLIC KEY-----\n";
    }

    private function base64UrlEncode(string $data): string
    {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }

    private function base64UrlDecode(string $data): string
    {
        $remainder = strlen($data) % 4;
        if ($remainder) {
            $data .= str_repeat('=', 4 - $remainder);
        }

        $decoded = base64_decode(strtr($data, '-_', '+/'), true);
        if ($decoded === false) {
            throw new RuntimeException('Invalid base64url payload from fingerprint reader.');
        }

        return $decoded;
    }

    /**
     * Convert IEEE P1363 ECDSA signature (r||s) to DER sequence for openssl_verify.
     */
    private function p1363ToDer(string $signature): ?string
    {
        $len = strlen($signature);
        if ($len === 0 || $len % 2 !== 0) {
            return null;
        }

        $half = $len / 2;
        $r = $this->prepareInteger(substr($signature, 0, $half));
        $s = $this->prepareInteger(substr($signature, $half));

        return "\x30".chr(2 + strlen($r) + 2 + strlen($s))."\x02".chr(strlen($r)).$r."\x02".chr(strlen($s)).$s;
    }

    private function prepareInteger(string $bytes): string
    {
        $bytes = ltrim($bytes, "\x00");
        if ($bytes === '') {
            $bytes = "\x00";
        }
        if ((ord($bytes[0]) & 0x80) !== 0) {
            $bytes = "\x00".$bytes;
        }

        return $bytes;
    }
}
