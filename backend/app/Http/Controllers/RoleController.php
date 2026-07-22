<?php

namespace App\Http\Controllers;

use App\Models\Role;
use App\Models\Privilege;
use Illuminate\Http\Request;

class RoleController extends Controller
{
    /**
     * List all roles with their privileges.
     */
    public function index()
    {
        $roles = Role::with('privileges')->orderBy('name')->get();
        return response()->json($roles);
    }

    /**
     * Create a new role.
     */
    public function store(Request $request)
    {
        $request->validate([
            'name' => 'required|string|max:100',
        ]);

        $role = Role::create([
            'name' => $request->name,
            'is_system_role' => false,
        ]);

        return response()->json($role, 201);
    }

    /**
     * Update a role.
     */
    public function update(Request $request, $id)
    {
        $request->validate([
            'name' => 'required|string|max:100',
        ]);

        $role = Role::findOrFail($id);

        if ($role->is_system_role) {
            return response()->json(['message' => 'Cannot modify system roles.'], 403);
        }

        $role->update([
            'name' => $request->name,
        ]);

        return response()->json($role);
    }

    /**
     * Delete a role.
     */
    public function destroy($id)
    {
        $role = Role::findOrFail($id);

        if ($role->is_system_role || $role->name === 'Owner') {
            return response()->json(['message' => 'Cannot delete system-seeded Owner role.'], 403);
        }

        $role->delete();

        return response()->json(['success' => true]);
    }

    /**
     * Sync privileges associated with a role.
     */
    public function syncPrivileges(Request $request, $id)
    {
        $request->validate([
            'privilege_keys' => 'required|array',
            'privilege_keys.*' => 'required|string|exists:privileges,key',
        ]);

        $role = Role::findOrFail($id);

        // Fetch Privilege UUIDs using key strings
        $privilegeIds = Privilege::whereIn('key', $request->privilege_keys)->pluck('id')->toArray();

        $role->privileges()->sync($privilegeIds);

        return response()->json($role->load('privileges'));
    }
}
