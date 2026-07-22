<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SubscriptionPlan extends Model
{
    use HasUuids;

    protected $fillable = [
        'name',
        'price',
        'currency',
        'duration_days',
        'max_staff_users',
        'max_members',
        'is_active',
    ];

    protected $casts = [
        'price' => 'decimal:2',
        'duration_days' => 'integer',
        'max_staff_users' => 'integer',
        'max_members' => 'integer',
        'is_active' => 'boolean',
    ];

    /**
     * Get the licenses associated with this plan.
     */
    public function licenses(): HasMany
    {
        return $this->hasMany(License::class);
    }
}
