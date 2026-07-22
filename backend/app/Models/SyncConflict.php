<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SyncConflict extends Model
{
    use HasFactory, HasUuids, BelongsToTenant;

    protected $table = 'sync_conflicts';

    protected $fillable = [
        'tenant_id',
        'entity_type',
        'entity_id',
        'client_payload',
        'server_payload',
        'resolved_by',
    ];

    protected $casts = [
        'client_payload' => 'array',
        'server_payload' => 'array',
    ];

    /**
     * Get the user who resolved this conflict.
     */
    public function resolver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'resolved_by');
    }
}
