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
            'tenant_slug' => 'required|string', // Resolved from ID/Slug login form field
        ]);

        $slug = $request->input('tenant_slug');

        // Resolve tenant by slug or UUID id
        $tenant = Tenant::where('slug', $slug)
            ->orWhere('id', $slug)
            ->first();

        if (!$tenant) {
            return response()->json(['message' => 'Tenant not found.'], 404);
        }

        // Check if tenant is active
        if ($tenant->status !== 'active') {
            return response()->json(['message' => 'Tenant account is ' . $tenant->status . '.'], 403);
        }

        // Lookup user strictly belonging to this tenant
        $user = User::where('tenant_id', $tenant->id)->where('email', $request->email)->first();

        if (!$user || !Hash::check($request->password, $user->password)) {
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
