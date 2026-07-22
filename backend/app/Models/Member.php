<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Member extends Model
{
    use HasFactory, HasUuids, BelongsToTenant;

    protected $fillable = [
        'id',
        'tenant_id',
        'first_name',
        'last_name',
        'email',
        'phone',
        'status',
    ];

    /**
     * Get all membership plan subscriptions for this member.
     */
    public function memberPlans(): HasMany
    {
        return $this->hasMany(MemberPlan::class, 'member_id');
    }

    /**
     * Get the current active plan subscription for this member.
     */
    public function activeMemberPlan(): HasOne
    {
        return $this->hasOne(MemberPlan::class, 'member_id')->where('status', 'active');
    }

    /**
     * Get the attendance history of this member.
     */
    public function attendances(): HasMany
    {
        return $this->hasMany(Attendance::class);
    }
}
