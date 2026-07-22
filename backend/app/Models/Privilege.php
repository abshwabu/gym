<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class Privilege extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'key',
        'label',
        'category',
    ];

    /**
     * Get the roles that have this privilege.
     */
    public function roles(): BelongsToMany
    {
        return $this->belongsToMany(Role::class, 'role_privilege', 'privilege_id', 'role_id')
                    ->withTimestamps();
    }
}
