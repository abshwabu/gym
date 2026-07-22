<?php

namespace App\Services;

use App\Models\Tenant;
use App\Models\Role;
use App\Models\User;
use App\Models\Privilege;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\DB;

class TenantProvisioning
{
    /**
     * Provision a new Tenant, its system owner role with all privileges, and the initial owner user.
     */
    public function provision(string $name, string $slug, string $status, array $ownerData): Tenant
    {
        return DB::transaction(function () use ($name, $slug, $status, $ownerData) {
            // 1. Create the tenant
            $tenant = Tenant::create([
                'name' => $name,
                'slug' => $slug,
                'status' => $status,
            ]);

            // Set the tenant context temporarily to allow creation of tenant-scoped models
            TenantContext::setTenant($tenant);

            // 2. Create the system "Owner" role
            $ownerRole = Role::create([
                'name' => 'Owner',
                'is_system_role' => true,
            ]);

            // 3. Attach all global privileges to this system role
            $privileges = Privilege::all();
            $ownerRole->privileges()->sync($privileges->pluck('id')->toArray());

            // 4. Create the tenant owner user
            $user = User::create([
                'name' => $ownerData['name'],
                'email' => $ownerData['email'],
                'password' => bcrypt($ownerData['password']),
                'is_tenant_owner' => true,
                'status' => $ownerData['status'] ?? 'active',
            ]);

            // 5. Assign the role to the user
            $user->roles()->sync([$ownerRole->id]);

            // Clear the temporary context
            TenantContext::clear();

            return $tenant;
        });
    }
}
