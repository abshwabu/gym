<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class EmployeeProfile extends Model
{
    use HasFactory, HasUuids, BelongsToTenant;

    protected $fillable = [
        'id',
        'tenant_id',
        'user_id',
        'employee_code',
        'hire_date',
        'employment_type',
        'salary_amount',
        'salary_currency',
        'salary_cycle',
        'status',
    ];

    protected $casts = [
        'hire_date' => 'date',
        'salary_amount' => 'decimal:2',
    ];

    /**
     * Next sequential employee code for the current tenant (e.g. EMP-101, EMP-102).
     * Starts at EMP-101 when no numeric EMP-* codes exist yet.
     */
    public static function generateEmployeeCode(): string
    {
        $max = 100;

        $codes = static::query()
            ->where('employee_code', 'like', 'EMP-%')
            ->pluck('employee_code');

        foreach ($codes as $code) {
            if (preg_match('/^EMP-(\d+)$/', (string) $code, $matches)) {
                $max = max($max, (int) $matches[1]);
            }
        }

        return 'EMP-' . ($max + 1);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function shifts(): HasMany
    {
        return $this->hasMany(StaffShift::class, 'employee_id');
    }

    public function attendances(): HasMany
    {
        return $this->hasMany(StaffAttendance::class, 'employee_id');
    }

    public function leaveRequests(): HasMany
    {
        return $this->hasMany(LeaveRequest::class, 'employee_id');
    }
}
