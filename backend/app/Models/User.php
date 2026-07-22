<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable, HasUuids, BelongsToTenant;

    protected $fillable = [
        'tenant_id',
        'name',
        'email',
        'password',
        'is_tenant_owner',
        'status',
    ];

    protected $hidden = [
        'password',
        'remember_token',
    ];

    protected $casts = [
        'email_verified_at' => 'datetime',
        'password' => 'hashed',
        'is_tenant_owner' => 'boolean',
    ];

    /**
     * Get the tenant that this user belongs to.
     */
    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    /**
     * Get the roles assigned to this user.
     */
    public function roles(): BelongsToMany
    {
        return $this->belongsToMany(Role::class, 'user_roles', 'user_id', 'role_id')
                    ->withTimestamps();
    }

    /**
     * Check if the user has a specific privilege.
     */
    public function hasPrivilege(string $privilegeKey): bool
    {
        // Tenant owners have all privileges implicitly
        if ($this->is_tenant_owner) {
            return true;
        }

        foreach ($this->roles as $role) {
            if ($role->name === 'Owner' || $role->name === 'Admin') {
                return true;
            }
            if ($role->privileges->contains('key', $privilegeKey)) {
                return true;
            }
        }
        return false;
    }
}
