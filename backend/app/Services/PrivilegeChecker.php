<?php

namespace App\Services;

use App\Models\User;

class PrivilegeChecker
{
    /**
     * Cache user privileges per-request.
     */
    protected array $cache = [];

    /**
     * Determine if the user has the specified privilege.
     */
    public function userCan(User $user, string $privilegeKey): bool
    {
        $userId = $user->id;

        if (!isset($this->cache[$userId])) {
            $this->cache[$userId] = $this->loadUserPrivileges($user);
        }

        // If the user has Owner/Admin permissions, they have implicit access to everything.
        if (in_array('*', $this->cache[$userId], true)) {
            return true;
        }

        return in_array($privilegeKey, $this->cache[$userId], true);
    }

    /**
     * Load privileges for a user.
     */
    protected function loadUserPrivileges(User $user): array
    {
        // Tenant owners bypass all checks
        if ($user->is_tenant_owner) {
            return ['*'];
        }

        $user->loadMissing('roles.privileges');
        
        $privileges = [];
        foreach ($user->roles as $role) {
            if ($role->name === 'Owner' || $role->name === 'Admin') {
                return ['*'];
            }
            foreach ($role->privileges as $privilege) {
                $privileges[] = $privilege->key;
            }
        }

        return array_unique($privileges);
    }
}
