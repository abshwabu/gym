<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class MembershipPlan extends Model
{
    use HasFactory, HasUuids, BelongsToTenant;

    protected $fillable = [
        'id',
        'tenant_id',
        'name',
        'price',
        'duration_days',
        'is_active',
    ];

    protected $casts = [
        'price' => 'decimal:2',
        'duration_days' => 'integer',
        'is_active' => 'boolean',
    ];

    /**
     * Get the members enrolled in this membership plan.
     */
    public function members(): HasMany
    {
        return $this->hasMany(Member::class, 'membership_plan_id');
    }
}
