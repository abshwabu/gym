<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class CheckPrivilege
{
    /**
     * Handle an incoming request.
     */
    public function handle(Request $request, Closure $next, string $privilege): Response
    {
        $user = $request->user();

        if (!$user || !$user->hasPrivilege($privilege)) {
            abort(403, "Unauthorized: Missing privilege [{$privilege}].");
        }

        return $next($request);
    }
}
