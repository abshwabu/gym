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
            }
        }

        return $next($request);
    }
}
