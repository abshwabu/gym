<?php

namespace App\Http\Middleware;

use App\Services\PrivilegeChecker;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class HasPrivilege
{
    protected PrivilegeChecker $checker;

    public function __construct(PrivilegeChecker $checker)
    {
        $this->checker = $checker;
    }

    /**
     * Handle an incoming request.
     */
    public function handle(Request $request, Closure $next, string $privilege): Response
    {
        $user = $request->user();

        if (!$user || !$this->checker->userCan($user, $privilege)) {
            abort(403, "Unauthorized: Missing privilege [{$privilege}].");
        }

        return $next($request);
    }
}
