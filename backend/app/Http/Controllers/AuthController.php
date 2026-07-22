<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    /**
     * Handle user login and issue a token.
     */
    public function login(Request $request)
    {
        $request->validate([
            'email' => 'required|email',
            'password' => 'required',
        ]);

        $user = User::where('email', $request->email)->first();

        if (!$user || !Hash::check($request->password, $user->password)) {
            throw ValidationException::withMessages([
                'email' => ['The provided credentials are incorrect.'],
            ]);
        }

        // Load relations
        $user->load('roles.privileges', 'tenant');

        // Extract flat array of privileges
        $privileges = [];
        $isOwnerOrAdmin = false;
        foreach ($user->roles as $role) {
            if ($role->name === 'Owner' || $role->name === 'Admin') {
                $isOwnerOrAdmin = true;
            }
            foreach ($role->privileges as $privilege) {
                $privileges[] = $privilege->id;
            }
        }

        // If the user has Owner/Admin privileges, they get all system privileges implicitly.
        if ($isOwnerOrAdmin) {
            $privileges = \App\Models\Privilege::pluck('id')->toArray();
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
                $privileges[] = $privilege->id;
            }
        }

        if ($isOwnerOrAdmin) {
            $privileges = \App\Models\Privilege::pluck('id')->toArray();
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
}
