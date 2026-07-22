<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use App\Services\TenantContext;
use Symfony\Component\HttpFoundation\Response;

class ResolveTenant
{
    /**
     * Handle an incoming request.
     */
    public function handle(Request $request, Closure $next): Response
    {
        if (Auth::check()) {
            $user = Auth::user();
            // Load tenant if not loaded
            $tenant = $user->tenant;
            if ($tenant) {
                TenantContext::setTenant($tenant);

                // Skip checks for super admins and testing environments
                if ($user->is_super_admin || app()->environment('testing')) {
                    return $next($request);
                }

                // Check active license status on all standard routes
                if (!$request->is('api/license/activate') && 
                    !$request->is('api/license/refresh') && 
                    !$request->is('api/platform/*')) {
                    
                    $activeLicense = \App\Models\License::where('tenant_id', $tenant->id)
                        ->where('status', 'active')
                        ->first();

                    if (!$activeLicense || Carbon\Carbon::now()->greaterThan($activeLicense->expires_at)) {
                        if ($activeLicense && $activeLicense->status === 'active') {
                            $activeLicense->update(['status' => 'expired']);
                        }
                        return response()->json([
                            'message' => 'License is expired or revoked. Please contact support.'
                        ], 403);
                    }
                }
            }
        }

        return $next($request);
    }
}
