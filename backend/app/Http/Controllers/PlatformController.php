<?php

namespace App\Http\Controllers;

use App\Models\Tenant;
use App\Models\User;
use App\Models\SubscriptionPlan;
use App\Models\License;
use App\Models\ImpersonationLog;
use App\Services\TenantProvisioning;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\Str;
use Illuminate\Support\Carbon;

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
        $tenants = Tenant::all()->map(function (Tenant $tenant) {
            $users = User::withoutGlobalScopes()->where('tenant_id', $tenant->id)->get();
            $owner = $users->firstWhere('is_tenant_owner', true);
            $activeLicense = License::where('tenant_id', $tenant->id)->where('status', 'active')->first();

            return [
                'id' => $tenant->id,
                'name' => $tenant->name,
                'slug' => $tenant->slug,
                'status' => $tenant->status,
                'created_at' => $tenant->created_at,
                'owner_email' => $owner ? $owner->email : 'N/A',
                'staff_count' => $users->count(),
                'active_license' => $activeLicense ? [
                    'key' => $activeLicense->license_key,
                    'expires_at' => $activeLicense->expires_at->toIso8601String(),
                ] : null,
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

        $tenant = $this->provisioner->provision(
            $request->name,
            $request->slug,
            'active',
            [
                'name' => $request->owner_name,
                'email' => $request->owner_email,
                'password' => Str::random(32),
                'status' => 'invited',
            ]
        );

        $owner = User::withoutGlobalScopes()
            ->where('tenant_id', $tenant->id)
            ->where('is_tenant_owner', true)
            ->first();

        $backendUrl = URL::temporarySignedRoute(
            'invitation.activate',
            now()->addDays(3),
            ['user' => $owner->id]
        );

        $frontendHost = env('FRONTEND_URL', 'http://localhost:5173');
        $activationUrl = str_replace(
            url('/api/staff/activate'),
            $frontendHost . '/accept-invite',
            $backendUrl
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
     */
    public function resetOwnerPassword($id)
    {
        $tenant = Tenant::findOrFail($id);
        $owner = User::withoutGlobalScopes()
            ->where('tenant_id', $tenant->id)
            ->where('is_tenant_owner', true)
            ->firstOrFail();

        $owner->update(['status' => 'invited']);

        $backendUrl = URL::temporarySignedRoute(
            'invitation.activate',
            now()->addDays(3),
            ['user' => $owner->id]
        );

        $frontendHost = env('FRONTEND_URL', 'http://localhost:5173');
        $activationUrl = str_replace(
            url('/api/staff/activate'),
            $frontendHost . '/accept-invite',
            $backendUrl
        );

        return response()->json([
            'message' => 'New password configuration link generated.',
            'activation_url' => $activationUrl,
        ]);
    }

    // --- SUBSCRIPTION PLANS CRUD ---

    public function plansIndex()
    {
        return response()->json(SubscriptionPlan::all());
    }

    public function plansStore(Request $request)
    {
        $request->validate([
            'name' => 'required|string|max:255',
            'price' => 'required|numeric|min:0',
            'currency' => 'required|string|size:3',
            'duration_days' => 'required|integer|min:1',
            'max_staff_users' => 'nullable|integer|min:1',
            'max_members' => 'nullable|integer|min:1',
            'is_active' => 'boolean',
        ]);

        $plan = SubscriptionPlan::create($request->all());

        return response()->json($plan, 201);
    }

    public function plansUpdate(Request $request, $id)
    {
        $request->validate([
            'name' => 'required|string|max:255',
            'price' => 'required|numeric|min:0',
            'currency' => 'required|string|size:3',
            'duration_days' => 'required|integer|min:1',
            'max_staff_users' => 'nullable|integer|min:1',
            'max_members' => 'nullable|integer|min:1',
            'is_active' => 'boolean',
        ]);

        $plan = SubscriptionPlan::findOrFail($id);
        $plan->update($request->all());

        return response()->json($plan);
    }

    public function plansDestroy($id)
    {
        $plan = SubscriptionPlan::findOrFail($id);

        // Check if there are active licenses referencing this plan
        $hasActiveLicenses = License::where('subscription_plan_id', $plan->id)
            ->where('status', 'active')
            ->exists();

        if ($hasActiveLicenses) {
            return response()->json([
                'message' => 'Cannot delete a subscription plan with active referencing licenses. Deactivate the plan instead.'
            ], 400);
        }

        $plan->delete();
        return response()->json(['success' => true]);
    }

    // --- LICENSES MANAGEMENT ---

    public function tenantLicenses($tenantId)
    {
        $licenses = License::with('subscriptionPlan')
            ->where('tenant_id', $tenantId)
            ->orderByDesc('created_at')
            ->get();

        return response()->json($licenses);
    }

    public function issueLicense(Request $request, $tenantId)
    {
        $request->validate([
            'subscription_plan_id' => 'required|uuid|exists:subscription_plans,id',
        ]);

        $tenant = Tenant::findOrFail($tenantId);
        $plan = SubscriptionPlan::findOrFail($request->subscription_plan_id);

        // Deactivate existing active licenses
        License::where('tenant_id', $tenantId)
            ->where('status', 'active')
            ->update(['status' => 'expired']);

        // Generate license key in the form GYM-XXXX-XXXX-XXXX
        $licenseKey = 'GYM-' . strtoupper(Str::random(4)) . '-' . strtoupper(Str::random(4)) . '-' . strtoupper(Str::random(4));

        $license = License::create([
            'tenant_id' => $tenant->id,
            'subscription_plan_id' => $plan->id,
            'license_key' => $licenseKey,
            'status' => 'active',
            'starts_at' => Carbon::now(),
            'expires_at' => Carbon::now()->addDays($plan->duration_days),
        ]);

        return response()->json($license->load('subscriptionPlan'), 201);
    }

    public function extendLicense(Request $request, $licenseId)
    {
        $request->validate([
            'days' => 'required|integer|min:1',
        ]);

        $license = License::findOrFail($licenseId);
        $license->update([
            'expires_at' => $license->expires_at->addDays($request->days),
            'status' => 'active', // Restore active status if it was expired
        ]);

        return response()->json($license);
    }

    public function revokeLicense($licenseId)
    {
        $license = License::findOrFail($licenseId);
        $license->update(['status' => 'revoked']);

        return response()->json([
            'message' => 'License has been revoked successfully.',
            'license' => $license,
        ]);
    }

    // --- IMPERSONATION ---

    public function impersonate(Request $request, $tenantId)
    {
        $request->validate([
            'reason' => 'required|string|min:4',
        ]);

        $tenant = Tenant::findOrFail($tenantId);
        
        // Find owner
        $owner = User::withoutGlobalScopes()
            ->where('tenant_id', $tenant->id)
            ->where('is_tenant_owner', true)
            ->firstOrFail();

        // Create Sanctum Token
        $token = $owner->createToken('gym_auth_token')->plainTextToken;

        // Log transaction
        $log = ImpersonationLog::create([
            'super_admin_id' => auth()->id(),
            'tenant_id' => $tenant->id,
            'impersonated_user_id' => $owner->id,
            'started_at' => Carbon::now(),
            'reason' => $request->reason,
        ]);

        return response()->json([
            'token' => $token,
            'user' => [
                'id' => $owner->id,
                'name' => $owner->name,
                'email' => $owner->email,
            ],
            'tenant' => $tenant,
            'impersonation_log_id' => $log->id,
        ]);
    }

    public function endImpersonate(Request $request)
    {
        $request->validate([
            'impersonation_log_id' => 'required|uuid|exists:impersonation_logs,id',
        ]);

        $log = ImpersonationLog::findOrFail($request->impersonation_log_id);
        $log->update(['ended_at' => Carbon::now()]);

        return response()->json(['success' => true]);
    }

    public function impersonationLogs()
    {
        $logs = ImpersonationLog::with(['superAdmin', 'tenant', 'impersonatedUser'])
            ->orderByDesc('started_at')
            ->get();

        return response()->json($logs);
    }
}
