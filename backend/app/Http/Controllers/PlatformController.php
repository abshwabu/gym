<?php

namespace App\Http\Controllers;

use App\Models\Tenant;
use App\Models\User;
use App\Services\TenantProvisioning;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\Str;

class PlatformController extends Controller
{
    protected TenantProvisioning $provisioner;

    public function __construct(TenantProvisioning $provisioner)
    {
        $this->provisioner = $provisioner;
    }

    /**
     * GET /api/platform/tenants
     * List all tenants with status, owner email, staff count, and created date.
     */
    public function index()
    {
        // Fetch all tenants with their users (ignoring tenant context scope, as super admin is global)
        $tenants = Tenant::all()->map(function (Tenant $tenant) {
            $users = User::withoutGlobalScopes()->where('tenant_id', $tenant->id)->get();
            $owner = $users->firstWhere('is_tenant_owner', true);

            return [
                'id' => $tenant->id,
                'name' => $tenant->name,
                'slug' => $tenant->slug,
                'status' => $tenant->status,
                'created_at' => $tenant->created_at,
                'owner_email' => $owner ? $owner->email : 'N/A',
                'staff_count' => $users->count(),
            ];
        });

        return response()->json($tenants);
    }

    /**
     * POST /api/platform/tenants
     * Provision a new tenant and its initial owner user.
     */
    public function store(Request $request)
    {
        $request->validate([
            'name' => 'required|string|max:255',
            'slug' => 'required|string|max:100|unique:tenants,slug',
            'owner_name' => 'required|string|max:255',
            'owner_email' => 'required|email',
        ]);

        // Provision via service
        $tenant = $this->provisioner->provision(
            $request->name,
            $request->slug,
            'active',
            [
                'name' => $request->owner_name,
                'email' => $request->owner_email,
                'password' => Str::random(32), // Random temporary password
                'status' => 'invited', // Start as invited so they must set their password
            ]
        );

        $owner = User::withoutGlobalScopes()
            ->where('tenant_id', $tenant->id)
            ->where('is_tenant_owner', true)
            ->first();

        // Generate signed link for owner password configuration
        $activationUrl = URL::temporarySignedRoute(
            'invitation.activate',
            now()->addDays(3),
            ['user' => $owner->id]
        );

        return response()->json([
            'message' => 'Tenant provisioned successfully.',
            'tenant' => $tenant,
            'owner' => $owner,
            'activation_url' => $activationUrl,
        ], 201);
    }

    /**
     * PATCH /api/platform/tenants/{id}/suspend
     * Suspend a tenant.
     */
    public function suspend($id)
    {
        $tenant = Tenant::findOrFail($id);
        $tenant->update(['status' => 'suspended']);

        return response()->json([
            'message' => "Tenant '{$tenant->name}' has been suspended.",
            'tenant' => $tenant,
        ]);
    }

    /**
     * PATCH /api/platform/tenants/{id}/activate
     * Activate a suspended tenant.
     */
    public function activate($id)
    {
        $tenant = Tenant::findOrFail($id);
        $tenant->update(['status' => 'active']);

        return response()->json([
            'message' => "Tenant '{$tenant->name}' has been activated.",
            'tenant' => $tenant,
        ]);
    }

    /**
     * POST /api/platform/tenants/{id}/reset-owner-password
     * Reset the tenant owner's password by generating a signed activation route link.
     */
    public function resetOwnerPassword($id)
    {
        $tenant = Tenant::findOrFail($id);
        $owner = User::withoutGlobalScopes()
            ->where('tenant_id', $tenant->id)
            ->where('is_tenant_owner', true)
            ->firstOrFail();

        // Put user back into invited status to configure new password
        $owner->update(['status' => 'invited']);

        $activationUrl = URL::temporarySignedRoute(
            'invitation.activate',
            now()->addDays(3),
            ['user' => $owner->id]
        );

        return response()->json([
            'message' => 'New password configuration link generated.',
            'activation_url' => $activationUrl,
        ]);
    }
}
