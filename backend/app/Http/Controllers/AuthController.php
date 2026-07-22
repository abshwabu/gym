<?php

namespace App\Http\Controllers;

use App\Models\Tenant;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    /**
     * Handle user login and issue a token.
     * 
     * NOTE FOR FRONTEND (Module 07):
     * Tenant resolution is ID-based. The login form must send 'tenant_slug' (or tenant uuid)
     * alongside 'email' and 'password'. The backend resolves the tenant from this slug
     * before checking credentials and scopes the user search to that tenant.
     */
    public function login(Request $request)
    {
        $request->validate([
            'email' => 'required|email',
            'password' => 'required',
            'tenant_slug' => 'nullable|string', // Nullable for super admin login
        ]);

        $email = $request->input('email');
        $password = $request->input('password');
        $tenantSlug = $request->input('tenant_slug');

        // 1. Attempt Super Admin lookup (tenant_id is null and is_super_admin = true)
        $superAdmin = User::withoutGlobalScopes()
            ->whereNull('tenant_id')
            ->where('email', $email)
            ->where('is_super_admin', true)
            ->first();

        if ($superAdmin && Hash::check($password, $superAdmin->password)) {
            $token = $superAdmin->createToken('gym_auth_token')->plainTextToken;
            return response()->json([
                'token' => $token,
                'user' => [
                    'id' => $superAdmin->id,
                    'name' => $superAdmin->name,
                    'email' => $superAdmin->email,
                    'is_super_admin' => true,
                ],
                'tenant' => null,
                'roles' => ['Super Admin'],
                'privileges' => ['platform.tenants.view', 'platform.tenants.create', 'platform.tenants.suspend'],
            ]);
        }

        // 2. Otherwise, require tenant_slug and resolve tenant
        if (!$tenantSlug) {
            throw ValidationException::withMessages([
                'tenant_slug' => ['The tenant slug field is required.'],
            ]);
        }

        // Resolve tenant by slug or UUID id
        $tenant = Tenant::where('slug', $tenantSlug)
            ->orWhere('id', $tenantSlug)
            ->first();

        if (!$tenant) {
            return response()->json(['message' => 'Tenant not found.'], 404);
        }

        // Check if tenant is suspended
        if ($tenant->status === 'suspended') {
            return response()->json(['message' => 'Your tenant account is suspended.'], 403);
        }

        // Check if tenant is active
        if ($tenant->status !== 'active') {
            return response()->json(['message' => 'Tenant account is ' . $tenant->status . '.'], 403);
        }

        // Lookup user strictly belonging to this tenant (ignoring global scope temporarily if needed, or keeping it)
        $user = User::withoutGlobalScopes()
            ->where('tenant_id', $tenant->id)
            ->where('email', $email)
            ->first();

        if (!$user || !Hash::check($password, $user->password)) {
            throw ValidationException::withMessages([
                'email' => ['The provided credentials are incorrect.'],
            ]);
        }

        // Check user status
        if ($user->status !== 'active') {
            return response()->json(['message' => "Your account status is currently '{$user->status}'."], 403);
        }

        // Load roles and privileges
        $user->load('roles.privileges', 'tenant');

        // Extract flat array of privileges
        $privileges = [];
        $isOwnerOrAdmin = false;
        foreach ($user->roles as $role) {
            if ($role->name === 'Owner' || $role->name === 'Admin') {
                $isOwnerOrAdmin = true;
            }
            foreach ($role->privileges as $privilege) {
                $privileges[] = $privilege->key;
            }
        }

        if ($user->is_tenant_owner || $isOwnerOrAdmin) {
            $privileges = \App\Models\Privilege::pluck('key')->toArray();
        } else {
            $privileges = array_unique($privileges);
        }

        $token = $user->createToken('gym_auth_token')->plainTextToken;

        return response()->json([
            'token' => $token,
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
            ],
            'tenant' => $user->tenant,
            'roles' => $user->roles->pluck('name'),
            'privileges' => array_values($privileges),
        ]);
    }

    /**
     * Get the currently authenticated user's details.
     */
    public function me(Request $request)
    {
        $user = $request->user();

        if ($user->is_super_admin) {
            return response()->json([
                'user' => [
                    'id' => $user->id,
                    'name' => $user->name,
                    'email' => $user->email,
                    'is_super_admin' => true,
                ],
                'tenant' => null,
                'roles' => ['Super Admin'],
                'privileges' => ['platform.tenants.view', 'platform.tenants.create', 'platform.tenants.suspend'],
            ]);
        }

        $user->load('roles.privileges', 'tenant');

        $privileges = [];
        $isOwnerOrAdmin = false;
        foreach ($user->roles as $role) {
            if ($role->name === 'Owner' || $role->name === 'Admin') {
                $isOwnerOrAdmin = true;
            }
            foreach ($role->privileges as $privilege) {
                $privileges[] = $privilege->key;
            }
        }

        if ($user->is_tenant_owner || $isOwnerOrAdmin) {
            $privileges = \App\Models\Privilege::pluck('key')->toArray();
        } else {
            $privileges = array_unique($privileges);
        }

        return response()->json([
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
            ],
            'tenant' => $user->tenant,
            'roles' => $user->roles->pluck('name'),
            'privileges' => array_values($privileges),
        ]);
    }

    /**
     * Terminate the session by deleting the auth token.
     */
    public function logout(Request $request)
    {
        if ($request->user()) {
            $request->user()->currentAccessToken()->delete();
        }

        return response()->json(['success' => true]);
    }
}
