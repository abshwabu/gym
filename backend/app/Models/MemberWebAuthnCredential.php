<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MemberWebAuthnCredential extends Model
{
    use HasUuids, BelongsToTenant;

    protected $table = 'member_webauthn_credentials';

    protected $fillable = [
        'id',
        'tenant_id',
        'member_id',
        'credential_id',
        'public_key',
        'sign_count',
        'transports',
        'device_name',
        'last_used_at',
    ];

    protected $casts = [
        'sign_count' => 'integer',
        'last_used_at' => 'datetime',
    ];

    protected $hidden = [
        'public_key',
    ];

    public function member(): BelongsTo
    {
        return $this->belongsTo(Member::class);
    }
}
