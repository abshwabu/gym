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

    public const SESSION_LIMIT_UNLIMITED = 'unlimited';
    public const SESSION_LIMIT_TOTAL = 'total';
    public const SESSION_LIMIT_PER_WEEK = 'per_week';
    public const SESSION_LIMIT_PER_MONTH = 'per_month';

    public const SESSION_LIMIT_TYPES = [
        self::SESSION_LIMIT_UNLIMITED,
        self::SESSION_LIMIT_TOTAL,
        self::SESSION_LIMIT_PER_WEEK,
        self::SESSION_LIMIT_PER_MONTH,
    ];

    protected static function booted()
    {
        static::saving(function (Plan $plan) {
            if (empty($plan->session_limit_type)) {
                $plan->session_limit_type = $plan->session_limit === null
                    ? self::SESSION_LIMIT_UNLIMITED
                    : self::SESSION_LIMIT_TOTAL;
            }

            if ($plan->session_limit_type === self::SESSION_LIMIT_UNLIMITED) {
                $plan->session_limit = null;
            }
        });
    }

    protected $fillable = [
        'id',
        'tenant_id',
        'name',
        'billing_cycle',
        'custom_cycle_days',
        'price',
        'currency',
        'session_limit_type',
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

    public function hasSessionCap(): bool
    {
        return $this->session_limit_type !== self::SESSION_LIMIT_UNLIMITED
            && $this->session_limit !== null;
    }

    /**
     * Lifetime punch-card caps expire the subscription; period caps only block until the window resets.
     */
    public function expiresSubscriptionOnSessionCap(): bool
    {
        return $this->session_limit_type === self::SESSION_LIMIT_TOTAL
            && $this->session_limit !== null;
    }
}
