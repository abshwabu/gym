<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

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
        'membership_plan_id',
        'plan_expires_at',
    ];

    protected $casts = [
        'plan_expires_at' => 'datetime',
    ];

    /**
     * Get the membership plan of this member.
     */
    public function plan(): BelongsTo
    {
        return $this->belongsTo(MembershipPlan::class, 'membership_plan_id');
    }

    /**
     * Get the attendance history of this member.
     */
    public function attendances(): HasMany
    {
        return $this->hasMany(Attendance::class);
    }
}
