<?php

namespace App\Http\Controllers;

use App\Models\License;
use App\Services\LicenseTokenService;
use App\Services\TenantContext;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class LicenseController extends Controller
{
    protected LicenseTokenService $tokenService;

    public function __construct(LicenseTokenService $tokenService)
    {
        $this->tokenService = $tokenService;
    }

    /**
     * POST /api/license/refresh
     * Refresh the tenant's locally verifiable signed license token.
     */
    public function refresh(Request $request)
    {
        $tenantId = TenantContext::getTenantId();
        if (!$tenantId) {
            return response()->json(['message' => 'Tenant context not resolved.'], 403);
        }

        // Fetch active license
        $license = License::where('tenant_id', $tenantId)
            ->where('status', 'active')
            ->first();

        if (!$license) {
            return response()->json(['message' => 'License is expired or revoked. Please contact support.'], 403);
        }

        // Check if expires_at is in the past
        if (Carbon::now()->greaterThan($license->expires_at)) {
            $license->update(['status' => 'expired']);
            return response()->json(['message' => 'License is expired. Please contact support.'], 403);
        }

        // Update validation audit log timestamp
        $license->update(['last_validated_at' => Carbon::now()]);

        // Generate signed token
        $token = $this->tokenService->signToken([
            'tenant_id' => $tenantId,
            'license_key' => $license->license_key,
            'expires_at' => $license->expires_at->toIso8601String(),
            'issued_at' => Carbon::now()->toIso8601String(),
        ]);

        return response()->json([
            'token' => $token,
            'expires_at' => $license->expires_at->toIso8601String(),
        ]);
    }

    /**
     * POST /api/license/activate
     * Activate a license key for this tenant.
     */
    public function activate(Request $request)
    {
        $request->validate([
            'license_key' => 'required|string',
        ]);

        $tenantId = TenantContext::getTenantId();
        if (!$tenantId) {
            return response()->json(['message' => 'Tenant context not resolved.'], 403);
        }

        $licenseKey = $request->input('license_key');

        // Find the license matching this key and belonging to this tenant
        $license = License::where('license_key', $licenseKey)
            ->where('tenant_id', $tenantId)
            ->first();

        if (!$license) {
            return response()->json(['message' => 'Invalid license key for this tenant.'], 422);
        }

        // If the license status is revoked, reject it
        if ($license->status === 'revoked') {
            return response()->json(['message' => 'This license key has been revoked.'], 422);
        }

        // Check if expires_at is in the past
        if (Carbon::now()->greaterThan($license->expires_at)) {
            $license->update(['status' => 'expired']);
            return response()->json(['message' => 'This license key is expired.'], 422);
        }

        // Deactivate other licenses for this tenant
        License::where('tenant_id', $tenantId)
            ->where('id', '!=', $license->id)
            ->where('status', 'active')
            ->update(['status' => 'expired']);

        // Set this license to active
        $license->update([
            'status' => 'active',
            'last_validated_at' => Carbon::now()
        ]);

        // Generate signed token
        $token = $this->tokenService->signToken([
            'tenant_id' => $tenantId,
            'license_key' => $license->license_key,
            'expires_at' => $license->expires_at->toIso8601String(),
            'issued_at' => Carbon::now()->toIso8601String(),
        ]);

        return response()->json([
            'token' => $token,
            'expires_at' => $license->expires_at->toIso8601String(),
            'message' => 'License activated successfully.'
        ]);
    }
}
