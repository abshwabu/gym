<?php

namespace App\Http\Controllers;

use App\Models\Member;
use App\Models\MemberWebAuthnCredential;
use App\Services\WebAuthnService;
use Illuminate\Http\Request;
use RuntimeException;

class FingerprintController extends Controller
{
    public function __construct(private WebAuthnService $webAuthn)
    {
    }

    /**
     * List enrolled fingerprints for a member (metadata only).
     */
    public function index(Member $member)
    {
        $credentials = MemberWebAuthnCredential::where('member_id', $member->id)
            ->orderByDesc('created_at')
            ->get(['id', 'member_id', 'device_name', 'transports', 'last_used_at', 'created_at']);

        return response()->json([
            'credentials' => $credentials,
            'has_fingerprint' => $credentials->isNotEmpty(),
        ]);
    }

    /**
     * Begin WebAuthn registration for a member's fingerprint.
     */
    public function registerOptions(Request $request, Member $member)
    {
        [$origin, $rpId] = $this->resolveOrigin($request);
        $tenantName = $request->user()?->tenant?->name ?? 'Gym';

        $options = $this->webAuthn->registrationOptions($member, $rpId, $tenantName.' Check-in');

        return response()->json($options);
    }

    /**
     * Finish WebAuthn registration and store the credential.
     */
    public function register(Request $request, Member $member)
    {
        $request->validate([
            'id' => 'required|string|max:512',
            'publicKey' => 'required|string',
            'clientDataJSON' => 'required|string',
            'transports' => 'nullable|array',
            'transports.*' => 'string|max:50',
            'deviceName' => 'nullable|string|max:255',
        ]);

        [$origin, $rpId] = $this->resolveOrigin($request);

        try {
            $credential = $this->webAuthn->finishRegistration($member, $request->only([
                'id', 'publicKey', 'clientDataJSON', 'transports', 'deviceName',
            ]), $origin, $rpId);
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json([
            'message' => 'Fingerprint enrolled successfully.',
            'credential' => [
                'id' => $credential->id,
                'device_name' => $credential->device_name,
                'created_at' => $credential->created_at,
            ],
            'has_fingerprint' => true,
        ], 201);
    }

    /**
     * Remove an enrolled fingerprint credential.
     */
    public function destroy(Member $member, string $credentialId)
    {
        $credential = MemberWebAuthnCredential::where('member_id', $member->id)
            ->where('id', $credentialId)
            ->firstOrFail();

        $credential->delete();

        return response()->json([
            'message' => 'Fingerprint removed.',
            'has_fingerprint' => MemberWebAuthnCredential::where('member_id', $member->id)->exists(),
        ]);
    }

    /**
     * Begin WebAuthn authentication (self-check fingerprint).
     */
    public function authenticateOptions(Request $request)
    {
        $request->validate([
            'member_id' => 'nullable|uuid|exists:members,id',
        ]);

        [$origin, $rpId] = $this->resolveOrigin($request);
        $options = $this->webAuthn->authenticationOptions($rpId, $request->input('member_id'));

        if (empty($options['allowCredentials'])) {
            return response()->json([
                'message' => 'No fingerprints enrolled yet. Enroll a member fingerprint first.',
            ], 422);
        }

        return response()->json($options);
    }

    /**
     * Finish WebAuthn authentication and resolve the member.
     */
    public function authenticate(Request $request)
    {
        $request->validate([
            'id' => 'required|string|max:512',
            'clientDataJSON' => 'required|string',
            'authenticatorData' => 'required|string',
            'signature' => 'required|string',
        ]);

        [$origin, $rpId] = $this->resolveOrigin($request);

        try {
            $credential = $this->webAuthn->finishAuthentication($request->only([
                'id', 'clientDataJSON', 'authenticatorData', 'signature',
            ]), $origin, $rpId);
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        $member = $credential->member;

        return response()->json([
            'member' => [
                'id' => $member->id,
                'first_name' => $member->first_name,
                'last_name' => $member->last_name,
                'status' => $member->status,
                'email' => $member->email,
                'phone' => $member->phone,
            ],
            'credential_id' => $credential->id,
        ]);
    }

    /**
     * @return array{0: string, 1: string} [origin, rpId]
     */
    private function resolveOrigin(Request $request): array
    {
        $headerOrigin = $request->headers->get('Origin');
        if (!$headerOrigin) {
            $referer = $request->headers->get('Referer');
            if ($referer && str_contains($referer, '://')) {
                $parts = parse_url($referer);
                $scheme = $parts['scheme'] ?? 'http';
                $host = $parts['host'] ?? 'localhost';
                $port = isset($parts['port']) ? ':'.$parts['port'] : '';
                $headerOrigin = $scheme.'://'.$host.$port;
            }
        }

        if ($headerOrigin && str_contains($headerOrigin, '://')) {
            $parts = parse_url($headerOrigin);
            $scheme = $parts['scheme'] ?? 'http';
            $host = $parts['host'] ?? 'localhost';
            $port = isset($parts['port']) ? ':'.$parts['port'] : '';
            $origin = $scheme.'://'.$host.$port;
            $rpId = $this->webAuthn->relyingPartyId($host);
        } else {
            $host = $request->getHost() ?: 'localhost';
            $scheme = $request->isSecure() ? 'https' : 'http';
            $port = $request->getPort();
            $defaultPort = $scheme === 'https' ? 443 : 80;
            $portSuffix = ($port && (int) $port !== $defaultPort) ? ':'.$port : '';
            $origin = $scheme.'://'.$host.$portSuffix;
            $rpId = $this->webAuthn->relyingPartyId($host);
        }

        return [$origin, $rpId];
    }
}
