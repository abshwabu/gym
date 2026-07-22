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

    protected $table = 'attendance'; // Specify database table name explicitly

    protected $fillable = [
        'id',
        'tenant_id',
        'member_id',
        'checked_in_at',
    ];

    protected $casts = [
        'checked_in_at' => 'datetime',
    ];

    /**
     * Get the member who checked in.
     */
    public function member(): BelongsTo
    {
        return $this->belongsTo(Member::class);
    }
}
