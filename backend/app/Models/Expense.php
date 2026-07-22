<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Expense extends Model
{
    use HasFactory, HasUuids, BelongsToTenant;

    protected $fillable = [
        'id',
        'tenant_id',
        'category',
        'amount',
        'currency',
        'incurred_at',
        'notes',
        'recorded_by',
    ];

    protected $casts = [
        'incurred_at' => 'datetime',
        'amount' => 'decimal:2',
    ];

    public function recorder(): BelongsTo
    {
        return $this->belongsTo(User::class, 'recorded_by');
    }
}
