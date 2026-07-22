<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class Role extends Model
{
    use HasFactory, HasUuids, BelongsToTenant;

    protected $fillable = [
        'tenant_id',
        'name',
        'is_system_role',
    ];

    protected $casts = [
        'is_system_role' => 'boolean',
    ];

    /**
     * Get the privileges associated with this role.
     */
    public function privileges(): BelongsToMany
    {
        return $this->belongsToMany(Privilege::class, 'role_privilege', 'role_id', 'privilege_id')
                    ->withTimestamps();
    }

    /**
     * Get the users assigned this role.
     */
    public function users(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'user_roles', 'role_id', 'user_id')
                    ->withTimestamps();
    }
}
