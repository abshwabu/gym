<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Attendance extends Model
{
    use HasFactory, HasUuids, BelongsToTenant;

    protected $table = 'attendances';

    protected $fillable = [
        'id',
        'tenant_id',
        'member_id',
        'member_plan_id',
        'checked_in_at',
        'checked_in_by',
        'method',
        'synced_at',
    ];

    protected $casts = [
        'checked_in_at' => 'datetime',
        'synced_at' => 'datetime',
    ];

    /**
     * Get the member who checked in.
     */
    public function member(): BelongsTo
    {
        return $this->belongsTo(Member::class);
    }

    /**
     * Get the specific subscription plan active during checkin.
     */
    public function memberPlan(): BelongsTo
    {
        return $this->belongsTo(MemberPlan::class, 'member_plan_id');
    }

    /**
     * Get the staff user who recorded the checkin.
     */
    public function staffUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'checked_in_by');
    }
}
