<?php

namespace App\Traits;

use App\Scopes\TenantScope;
use App\Services\TenantContext;

trait BelongsToTenant
{
    /**
     * Boot the BelongsToTenant trait for the model.
     */
    protected static function bootBelongsToTenant(): void
    {
        static::addGlobalScope(new TenantScope);

        static::creating(function ($model) {
            if (TenantContext::hasTenant()) {
                // Unconditionally force tenant_id to be the authenticated tenant ID,
                // ignoring any client-provided tenant_id input.
                $model->tenant_id = TenantContext::getTenantId();
            }
        });
    }
}
