<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use App\Models\SubscriptionPlan;
use App\Models\License;
use App\Models\ImpersonationLog;
use App\Services\TenantProvisioning;
use App\Services\LicenseTokenService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class SuperAdminTest extends TestCase
{
    use RefreshDatabase;

    protected User $superAdmin;
    protected Tenant $tenant;
    protected User $tenantOwner;
    protected SubscriptionPlan $starterPlan;

    protected function setUp(): void
    {
        parent::setUp();

        // 1. Seed global privileges first (mimic DatabaseSeeder)
        $this->seed(\Database\Seeders\DatabaseSeeder::class);

        // 2. Create a Super Admin account
        $this->superAdmin = User::create([
            'tenant_id' => null,
            'name' => 'Platform Super Admin',
            'email' => 'super@admin.test',
            'password' => Hash::make('secret123'),
            'is_super_admin' => true,
            'status' => 'active',
        ]);

        // 3. Resolve seeded tenant and owner
        $this->tenant = Tenant::where('slug', 'apex')->first();
        $this->tenantOwner = User::withoutGlobalScopes()
            ->where('tenant_id', $this->tenant->id)
            ->where('is_tenant_owner', true)
            ->first();

        // 4. Retrieve starter plan from seeder
        $this->starterPlan = SubscriptionPlan::first();
    }

    /**
     * Test super admin login without tenant slug.
     */
    public function test_super_admin_can_login_without_tenant_slug()
    {
        $response = $this->postJson('/api/login', [
            'email' => 'super@admin.test',
            'password' => 'secret123',
        ]);

        $response->assertStatus(200)
            ->assertJsonStructure(['token', 'user' => ['is_super_admin']]);

        $this->assertTrue($response->json('user.is_super_admin'));
    }

    /**
     * Test super admin can list tenants.
     */
    public function test_super_admin_can_list_all_tenants()
    {
        $response = $this->actingAs($this->superAdmin)
            ->getJson('/api/platform/tenants');

        $response->assertStatus(200)
            ->assertJsonCount(1)
            ->assertJsonFragment([
                'slug' => 'apex',
                'owner_email' => 'admin@apex.com',
            ]);
    }

    /**
     * Test non-super-admin is forbidden from platform routes.
     */
    public function test_tenant_owner_is_forbidden_from_platform_routes()
    {
        $response = $this->actingAs($this->tenantOwner)
            ->getJson('/api/platform/tenants');

        $response->assertStatus(403);
    }

    /**
     * Test subscription plans CRUD.
     */
    public function test_subscription_plans_crud_endpoints()
    {
        // 1. Create plan
        $createRes = $this->actingAs($this->superAdmin)
            ->postJson('/api/platform/subscription-plans', [
                'name' => 'Custom Plan',
                'price' => 99.99,
                'currency' => 'USD',
                'duration_days' => 90,
                'max_staff_users' => 5,
                'max_members' => 100,
                'is_active' => true,
            ]);

        $createRes->assertStatus(201);
        $planId = $createRes->json('id');

        // 2. Read plan list
        $listRes = $this->actingAs($this->superAdmin)
            ->getJson('/api/platform/subscription-plans');
        $listRes->assertStatus(200);

        // 3. Update plan
        $updateRes = $this->actingAs($this->superAdmin)
            ->patchJson("/api/platform/subscription-plans/{$planId}", [
                'name' => 'Custom Plan Updated',
                'price' => 109.99,
                'currency' => 'USD',
                'duration_days' => 90,
                'max_staff_users' => 5,
                'max_members' => 100,
                'is_active' => true,
            ]);
        $updateRes->assertStatus(200)->assertJsonFragment(['name' => 'Custom Plan Updated']);

        // 4. Delete plan
        $deleteRes = $this->actingAs($this->superAdmin)
            ->deleteJson("/api/platform/subscription-plans/{$planId}");
        $deleteRes->assertStatus(200);
    }

    /**
     * Test deactivating a plan instead of deleting it if active licenses exist.
     */
    public function test_plan_deletion_blocked_if_active_licenses_exist()
    {
        // 1. Issue a license for our starter plan
        License::create([
            'tenant_id' => $this->tenant->id,
            'subscription_plan_id' => $this->starterPlan->id,
            'license_key' => 'GYM-TEST-KEY-1234',
            'status' => 'active',
            'starts_at' => Carbon::now(),
            'expires_at' => Carbon::now()->addDays(30),
        ]);

        // 2. Attempt deletion
        $response = $this->actingAs($this->superAdmin)
            ->deleteJson("/api/platform/subscription-plans/{$this->starterPlan->id}");

        $response->assertStatus(400)
            ->assertJsonFragment(['message' => 'Cannot delete a subscription plan with active referencing licenses. Deactivate the plan instead.']);
    }

    /**
     * Test license provisioning, manual extensions, and revocations.
     */
    public function test_license_provisioning_and_lifecyle()
    {
        // 1. Issue License
        $issueRes = $this->actingAs($this->superAdmin)
            ->postJson("/api/platform/tenants/{$this->tenant->id}/licenses", [
                'subscription_plan_id' => $this->starterPlan->id,
            ]);

        $issueRes->assertStatus(201)
            ->assertJsonFragment(['status' => 'active']);

        $licenseId = $issueRes->json('id');
        $this->assertNotNull($issueRes->json('license_key'));

        // 2. Extend License
        $extendRes = $this->actingAs($this->superAdmin)
            ->patchJson("/api/platform/licenses/{$licenseId}/extend", [
                'days' => 15,
            ]);
        $extendRes->assertStatus(200);

        // 3. Revoke License
        $revokeRes = $this->actingAs($this->superAdmin)
            ->patchJson("/api/platform/licenses/{$licenseId}/revoke");
        $revokeRes->assertStatus(200)
            ->assertJsonFragment(['status' => 'revoked']);
    }

    /**
     * Test client-side offline signed license token refresh verification.
     */
    public function test_client_license_token_refresh_and_verification()
    {
        // 1. Issue license first
        $license = License::create([
            'tenant_id' => $this->tenant->id,
            'subscription_plan_id' => $this->starterPlan->id,
            'license_key' => 'GYM-JWT-REFRESH-TEST',
            'status' => 'active',
            'starts_at' => Carbon::now(),
            'expires_at' => Carbon::now()->addDays(30),
        ]);

        // 2. Trigger token refresh as the tenant owner
        $response = $this->actingAs($this->tenantOwner)
            ->postJson('/api/license/refresh', [], [
                'X-Tenant-Slug' => 'apex'
            ]);

        $response->assertStatus(200)
            ->assertJsonStructure(['token', 'expires_at']);

        // 3. Verify JWT token signature locally using the token service
        $tokenService = new LicenseTokenService();
        $payload = $tokenService->verifyToken($response->json('token'));

        $this->assertNotNull($payload);
        $this->assertEquals($this->tenant->id, $payload['tenant_id']);
        $this->assertEquals('GYM-JWT-REFRESH-TEST', $payload['license_key']);
    }

    /**
     * Test token refresh blocks if license is expired or revoked.
     */
    public function test_token_refresh_blocks_if_license_is_invalid()
    {
        // 1. Issue revoked license
        License::create([
            'tenant_id' => $this->tenant->id,
            'subscription_plan_id' => $this->starterPlan->id,
            'license_key' => 'GYM-REVOKED-TEST',
            'status' => 'revoked',
            'starts_at' => Carbon::now(),
            'expires_at' => Carbon::now()->addDays(30),
        ]);

        // 2. Trigger refresh
        $response = $this->actingAs($this->tenantOwner)
            ->postJson('/api/license/refresh', [], [
                'X-Tenant-Slug' => 'apex'
            ]);

        $response->assertStatus(403)
            ->assertJsonFragment(['message' => 'License is expired or revoked. Please contact support.']);
    }

    /**
     * Test write-time enforcements of plans limits (members and staff user counts).
     */
    public function test_subscription_limits_enforced_at_write_time()
    {
        // 1. Create a platform plan with strict limits: max 1 staff user, max 1 member
        $limitedPlan = SubscriptionPlan::create([
            'name' => 'Limited Plan',
            'price' => 10.00,
            'currency' => 'USD',
            'duration_days' => 30,
            'max_staff_users' => 1,
            'max_members' => 1,
            'is_active' => true,
        ]);

        // 2. Assign to our tenant
        License::create([
            'tenant_id' => $this->tenant->id,
            'subscription_plan_id' => $limitedPlan->id,
            'license_key' => 'GYM-LIMITED-KEY',
            'status' => 'active',
            'starts_at' => Carbon::now(),
            'expires_at' => Carbon::now()->addDays(30),
        ]);

        // 3. Attempt adding a new Member (seeded seeder already has 2 members, exceeding the limit of 1)
        $memberRes = $this->actingAs($this->tenantOwner)
            ->postJson('/api/members', [
                'id' => crypto_uuid_placeholder_or_random(),
                'first_name' => 'Limit',
                'last_name' => 'Breaker',
                'email' => 'limit@breaker.com',
                'phone' => '555-9999',
                'status' => 'Active',
            ], [
                'X-Tenant-Slug' => 'apex'
            ]);

        $memberRes->assertStatus(422)
            ->assertJsonFragment(['message' => 'License limit exceeded: maximum members reached.']);

        // 4. Attempt inviting a new Staff user (seeded seeder already has 2 users: admin and staff, exceeding limit of 1)
        $staffRes = $this->actingAs($this->tenantOwner)
            ->postJson('/api/staff/invite', [
                'name' => 'Limit Staff',
                'email' => 'limit.staff@gym.com',
                'role_ids' => [\App\Models\Role::first()->id],
            ], [
                'X-Tenant-Slug' => 'apex'
            ]);

        $staffRes->assertStatus(422)
            ->assertJsonFragment(['message' => 'License limit exceeded: maximum staff members reached.']);
    }

    /**
     * Test platform impersonation starting, logging, and ending.
     */
    public function test_platform_impersonation_flows()
    {
        // 1. Start impersonating
        $impersonateRes = $this->actingAs($this->superAdmin)
            ->postJson("/api/platform/tenants/{$this->tenant->id}/impersonate", [
                'reason' => 'Debugging billing issue',
            ]);

        $impersonateRes->assertStatus(200)
            ->assertJsonStructure(['token', 'user', 'tenant', 'impersonation_log_id']);

        $logId = $impersonateRes->json('impersonation_log_id');
        $this->assertDatabaseHas('impersonation_logs', [
            'id' => $logId,
            'reason' => 'Debugging billing issue',
            'ended_at' => null,
        ]);

        // 2. Fetch impersonation logs
        $logsRes = $this->actingAs($this->superAdmin)
            ->getJson('/api/platform/impersonation-logs');
        $logsRes->assertStatus(200)->assertJsonCount(1);

        // 3. End impersonating
        $endRes = $this->actingAs($this->superAdmin)
            ->postJson('/api/platform/impersonate/end', [
                'impersonation_log_id' => $logId,
            ]);
        $endRes->assertStatus(200);

        $this->assertNotNull(ImpersonationLog::find($logId)->ended_at);
    }
}

/**
 * Quick helper to mock crypto.randomUUID client format.
 */
function crypto_uuid_placeholder_or_random() {
    return (string) \Illuminate\Support\Str::uuid();
}
