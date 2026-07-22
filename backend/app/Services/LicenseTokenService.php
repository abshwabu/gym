<?php

namespace App\Services;

class LicenseTokenService
{
    /**
     * Sign a JWT token using RS256 private key.
     */
    public function signToken(array $payload): string
    {
        $header = json_encode(['alg' => 'RS256', 'typ' => 'JWT']);
        $payloadStr = json_encode($payload);
        
        $base64UrlHeader = $this->base64UrlEncode($header);
        $base64UrlPayload = $this->base64UrlEncode($payloadStr);
        
        $signatureInput = $base64UrlHeader . "." . $base64UrlPayload;
        
        $privateKey = openssl_pkey_get_private(file_get_contents($this->getPrivateKeyPath()));
        if (!$privateKey) {
            throw new \RuntimeException('Failed to read private license key.');
        }
        
        openssl_sign($signatureInput, $signature, $privateKey, OPENSSL_ALGO_SHA256);
        
        $base64UrlSignature = $this->base64UrlEncode($signature);
        
        return $signatureInput . "." . $base64UrlSignature;
    }

    /**
     * Verify a JWT token signature using the public key.
     */
    public function verifyToken(string $token): ?array
    {
        $parts = explode('.', $token);
        if (count($parts) !== 3) {
            return null;
        }

        list($headerB64, $payloadB64, $signatureB64) = $parts;

        $signatureInput = $headerB64 . "." . $payloadB64;
        $signature = $this->base64UrlDecode($signatureB64);

        $publicKey = openssl_pkey_get_public(file_get_contents($this->getPublicKeyPath()));
        if (!$publicKey) {
            return null;
        }

        $result = openssl_verify($signatureInput, $signature, $publicKey, OPENSSL_ALGO_SHA256);

        if ($result === 1) {
            return json_decode($this->base64UrlDecode($payloadB64), true);
        }

        return null;
    }

    /**
     * Get the public key string.
     */
    public function getPublicKey(): string
    {
        return file_get_contents($this->getPublicKeyPath());
    }

    protected function getPrivateKeyPath(): string
    {
        $path = storage_path('keys/license_private.key');
        if (!file_exists($path)) {
            $this->generateKeys();
        }
        return $path;
    }

    protected function getPublicKeyPath(): string
    {
        $path = storage_path('keys/license_public.key');
        if (!file_exists($path)) {
            $this->generateKeys();
        }
        return $path;
    }

    /**
     * Generate RS256 keypair dynamically.
     */
    public function generateKeys(): void
    {
        $dir = storage_path('keys');
        if (!file_exists($dir)) {
            mkdir($dir, 0755, true);
        }

        $config = array(
            "digest_alg" => "sha256",
            "private_key_bits" => 2048,
            "private_key_type" => OPENSSL_KEYTYPE_RSA,
        );

        $res = openssl_pkey_new($config);
        if (!$res) {
            throw new \RuntimeException('Failed to generate OpenSSL keys: ' . openssl_error_string());
        }

        openssl_pkey_export($res, $privKey);

        $pubKeyDetails = openssl_pkey_get_details($res);
        $pubKey = $pubKeyDetails["key"];

        file_put_contents(storage_path('keys/license_private.key'), $privKey);
        file_put_contents(storage_path('keys/license_public.key'), $pubKey);
    }

    protected function base64UrlEncode(string $data): string
    {
        return str_replace(['+', '/', '='], ['-', '_', ''], base64_encode($data));
    }

    protected function base64UrlDecode(string $data): string
    {
        $remainder = strlen($data) % 4;
        if ($remainder) {
            $data .= str_repeat('=', 4 - $remainder);
        }
        return base64_decode(str_replace(['-', '_'], ['+', '/'], $data));
    }
}
