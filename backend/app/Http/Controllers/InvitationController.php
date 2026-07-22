<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Services\TenantContext;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\Str;

class InvitationController extends Controller
{
    /**
     * Invite a new staff user.
     */
    public function invite(Request $request)
    {
        $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|email',
            'role_ids' => 'required|array',
            'role_ids.*' => 'required|uuid|exists:roles,id',
        ]);

        $tenantId = TenantContext::getTenantId();

        // Check email uniqueness within the active tenant
        $existing = User::where('tenant_id', $tenantId)->where('email', $request->email)->first();
        if ($existing) {
            return response()->json(['message' => 'A user with this email already exists in your tenant.'], 422);
        }

        // Create user with 'invited' status
        $user = User::create([
            'name' => $request->name,
            'email' => $request->email,
            'password' => bcrypt(Str::random(32)), // Random temp password
            'status' => 'invited',
            'is_tenant_owner' => false,
        ]);

        // Map roles to user
        $user->roles()->sync($request->role_ids);

        // Generate signed route URL (valid for 3 days)
        $activationUrl = URL::temporarySignedRoute(
            'invitation.activate',
            now()->addDays(3),
            ['user' => $user->id]
        );

        return response()->json([
            'message' => 'Staff user invited successfully.',
            'user' => $user,
            'activation_url' => $activationUrl,
        ], 201);
    }

    /**
     * Activate the invited user via signed link parameters.
     */
    public function activate(Request $request, User $user)
    {
        $request->validate([
            'password' => 'required|string|min:8|confirmed',
        ]);

        if ($user->status !== 'invited') {
            return response()->json(['message' => 'This activation link is invalid or has already been used.'], 400);
        }

        // Activate user
        $user->update([
            'password' => bcrypt($request->password),
            'status' => 'active',
        ]);

        return response()->json([
            'message' => 'Account activated successfully. You may now log in.',
        ]);
    }
}
