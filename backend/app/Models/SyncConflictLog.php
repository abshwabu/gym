<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class SyncConflictLog extends Model
{
    use HasFactory, HasUuids, BelongsToTenant;

    protected $fillable = [
        'tenant_id',
        'table_name',
        'record_id',
        'client_payload',
        'server_payload',
        'resolved',
    ];

    protected $casts = [
        'client_payload' => 'array',
        'server_payload' => 'array',
        'resolved' => 'boolean',
    ];
}
