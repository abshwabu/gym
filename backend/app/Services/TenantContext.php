<?php

namespace App\Services;

use App\Models\Tenant;

class TenantContext
{
    protected static ?Tenant $tenant = null;

    /**
     * Set the current tenant.
     */
    public static function setTenant(Tenant $tenant): void
    {
        self::$tenant = $tenant;
    }

    /**
     * Get the current tenant model.
     */
    public static function getTenant(): ?Tenant
    {
        return self::$tenant;
    }

    /**
     * Get the current tenant ID.
     */
    public static function getTenantId(): ?string
    {
        return self::$tenant?->id;
    }

    /**
     * Check if a tenant context is active.
     */
    public static function hasTenant(): bool
    {
        return self::$tenant !== null;
    }

    /**
     * Clear the tenant context.
     */
    public static function clear(): void
    {
        self::$tenant = null;
    }
}
