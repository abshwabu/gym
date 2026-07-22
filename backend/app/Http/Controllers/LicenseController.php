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
}
