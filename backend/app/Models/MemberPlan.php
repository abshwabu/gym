<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

class MemberPlan extends Model
{
    use HasFactory, HasUuids, BelongsToTenant;

    protected static function booted()
    {
        static::created(function ($memberPlan) {
            $plan = $memberPlan->plan;
            if ($plan) {
                if (!$memberPlan->client_uuid) {
                    Invoice::create([
                        'tenant_id' => $memberPlan->tenant_id,
                        'member_id' => $memberPlan->member_id,
                        'member_plan_id' => $memberPlan->id,
                        'amount' => $plan->price,
                        'currency' => $plan->currency ?: 'USD',
                        'status' => 'unpaid',
                        'issued_at' => now(),
                        'due_at' => now()->addDays(7),
                    ]);
                }
            }
        });
    }

    protected $fillable = [
        'id',
        'tenant_id',
        'member_id',
        'plan_id',
        'starts_at',
        'expires_at',
        'status',
        'sessions_used',
        'frozen_at',
        'total_frozen_days',
        'client_uuid',
    ];

    protected $casts = [
        'starts_at' => 'datetime',
        'expires_at' => 'datetime',
        'sessions_used' => 'integer',
        'frozen_at' => 'datetime',
        'total_frozen_days' => 'integer',
    ];

    public function plan(): BelongsTo
    {
        return $this->belongsTo(Plan::class, 'plan_id');
    }

    public function member(): BelongsTo
    {
        return $this->belongsTo(Member::class, 'member_id');
    }

    /**
     * Count check-ins that count toward the plan's current limit window.
     */
    public function sessionsUsedTowardLimit(?Carbon $at = null): int
    {
        $plan = $this->plan;
        if (!$plan || !$plan->hasSessionCap()) {
            return 0;
        }

        $at = $at ? $at->copy() : Carbon::now();

        return match ($plan->session_limit_type) {
            Plan::SESSION_LIMIT_TOTAL => (int) $this->sessions_used,
            Plan::SESSION_LIMIT_PER_WEEK => $this->attendancesInRange(
                $at->copy()->startOfWeek(),
                $at->copy()->endOfWeek()
            ),
            Plan::SESSION_LIMIT_PER_MONTH => $this->attendancesInRange(
                $at->copy()->startOfMonth(),
                $at->copy()->endOfMonth()
            ),
            default => 0,
        };
    }

    public function isSessionLimitReached(?Carbon $at = null): bool
    {
        $plan = $this->plan;
        if (!$plan || !$plan->hasSessionCap()) {
            return false;
        }

        return $this->sessionsUsedTowardLimit($at) >= $plan->session_limit;
    }

    protected function attendancesInRange(Carbon $start, Carbon $end): int
    {
        return Attendance::where('member_plan_id', $this->id)
            ->whereBetween('checked_in_at', [$start, $end])
            ->count();
    }

    /**
     * Increment the sessions used counter.
     * Lifetime (total) caps expire the subscription when reached; period caps do not.
     */
    public function incrementSession(): bool
    {
        $plan = $this->plan;

        $this->increment('sessions_used');
        $this->refresh();

        if ($plan && $plan->expiresSubscriptionOnSessionCap()) {
            if ($this->sessions_used >= $plan->session_limit) {
                $this->update(['status' => 'expired']);
            }
        }

        return true;
    }

    /**
     * Freeze subscription.
     */
    public function freeze(): bool
    {
        if ($this->status !== 'active') {
            return false;
        }

        $this->update([
            'status' => 'frozen',
            'frozen_at' => Carbon::now(),
        ]);

        return true;
    }

    /**
     * Unfreeze subscription, extending expires_at by duration capped at remaining freeze allowance.
     */
    public function unfreeze(): bool
    {
        if ($this->status !== 'frozen' || !$this->frozen_at) {
            return false;
        }

        $plan = $this->plan;
        
        // Calculate days frozen
        $frozenDays = abs(Carbon::now()->diffInDays($this->frozen_at));
        if ($frozenDays < 1) {
            $frozenDays = 1; // Round up to minimum 1 day extension
        }

        $maxAllowance = $plan ? $plan->freeze_allowance_days : 0;
        $remainingAllowance = max(0, $maxAllowance - $this->total_frozen_days);

        // Cap extension duration to remaining allowance
        $daysToExtend = min($frozenDays, $remainingAllowance);

        $this->update([
            'status' => 'active',
            'expires_at' => $this->expires_at->addDays($daysToExtend),
            'total_frozen_days' => $this->total_frozen_days + $daysToExtend,
            'frozen_at' => null,
        ]);

        return true;
    }
}
