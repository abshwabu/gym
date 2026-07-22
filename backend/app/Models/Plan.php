<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Plan extends Model
{
    use HasFactory, HasUuids, BelongsToTenant, SoftDeletes;

    protected $fillable = [
        'id',
        'tenant_id',
        'name',
        'billing_cycle',
        'custom_cycle_days',
        'price',
        'currency',
        'session_limit',
        'access_hours',
        'freeze_allowance_days',
        'is_active',
    ];

    protected $casts = [
        'custom_cycle_days' => 'integer',
        'price' => 'decimal:2',
        'session_limit' => 'integer',
        'access_hours' => 'array',
        'freeze_allowance_days' => 'integer',
        'is_active' => 'boolean',
    ];

    /**
     * Get the subscription history (member_plans) referencing this plan.
     */
    public function memberPlans(): HasMany
    {
        return $this->hasMany(MemberPlan::class, 'plan_id');
    }
}
