<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Member;
use App\Models\Plan;
use App\Models\MemberPlan;
use App\Models\Role;
use App\Models\Tenant;
use App\Models\User;
use App\Services\TenantContext;
use App\Services\TenantProvisioning;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class GymSaaSTest extends TestCase
{
    use RefreshDatabase;

    protected Tenant $tenantA;
    protected User $userA;
    
    protected Tenant $tenantB;
    protected User $userB;

    protected function setUp(): void
    {
        parent::setUp();

        // 1. Run seeders to set up privileges
        $this->seed();

        // 2. Retrieve seeded Apex tenant (Tenant A) and its owner
        $this->tenantA = Tenant::where('slug', 'apex')->first();
        $this->userA = User::where('email', 'admin@apex.com')->first();

        // 3. Provision a separate Tenant (Tenant B) and its owner using the TenantProvisioning service
        $provisioner = new TenantProvisioning();
        $this->tenantB = $provisioner->provision(
            'Vertex Gym',
            'vertex',
            'active',
            [
                'name' => 'Vertex Owner',
                'email' => 'owner@vertex.com',
                'password' => 'password',
                'status' => 'active',
            ]
        );
        $this->userB = User::where('email', 'owner@vertex.com')->first();
    }

    /**
     * Test that a user can login and receive the correct token and privileges structure.
     */
    public function test_login_authenticates_and_returns_privileges(): void
    {
        $response = $this->postJson('/api/login', [
            'email' => 'admin@apex.com',
            'password' => 'password',
            'tenant_slug' => 'apex',
        ]);

        $response->assertStatus(200)
                 ->assertJsonStructure([
                     'token',
                     'user' => ['id', 'name', 'email'],
                     'tenant' => ['id', 'name', 'slug', 'status'],
                     'roles',
                     'privileges',
                 ]);

        $this->assertContains('members.create', $response->json('privileges'));
        $this->assertContains('plans.create', $response->json('privileges'));
    }

    /**
     * Test tenant query isolation and parameter spoofing prevention.
     */
    public function test_tenant_isolation_prevents_unauthorized_read_and_write(): void
    {
        // 1. Create a member belonging to Tenant B
        TenantContext::setTenant($this->tenantB);
        $memberB = Member::create([
            'id' => crypto_random_uuid_placeholder(),
            'first_name' => 'TenantB',
            'last_name' => 'Member',
            'status' => 'Active',
        ]);
        TenantContext::clear();

        // 2. Authenticate as User A (Tenant A) and attempt to query Tenant B's member directly in DB
        $this->actingAs($this->userA);
        TenantContext::setTenant($this->tenantA);

        $member = Member::find($memberB->id);
        $this->assertNull($member, "User from Tenant A should not be able to read Tenant B's records");

        // 3. Attempt to write a member record and forge the tenant_id in request input
        $forgedMemberId = crypto_random_uuid_placeholder();
        $response = $this->postJson('/api/members', [
            'id' => $forgedMemberId,
            'tenant_id' => $this->tenantB->id, // FORGED tenant ID
            'first_name' => 'Spoofed',
            'last_name' => 'Member',
            'status' => 'Active',
        ]);

        $response->assertStatus(201);
        
        $createdMember = Member::find($forgedMemberId);
        $this->assertNotNull($createdMember);
        $this->assertEquals($this->tenantA->id, $createdMember->tenant_id);
        $this->assertNotEquals($this->tenantB->id, $createdMember->tenant_id);

        TenantContext::clear();
    }

    /**
     * Test server-side privilege checking.
     */
    public function test_privilege_authorization_gating(): void
    {
        $staff = User::where('email', 'staff@apex.com')->first();

        // Staff user tries to create a plan (requires 'plans.create')
        $response = $this->actingAs($staff)
                         ->postJson('/api/plans', [
                             'id' => crypto_random_uuid_placeholder(),
                             'name' => 'Unauthorized Plan',
                             'billing_cycle' => 'monthly',
                             'price' => 10.00,
                         ]);

        $response->assertStatus(403);

        // Owner/Admin user (User A) creates membership plan
        $response = $this->actingAs($this->userA)
                         ->postJson('/api/plans', [
                             'id' => crypto_random_uuid_placeholder(),
                             'name' => 'Standard Monthly',
                             'billing_cycle' => 'monthly',
                             'price' => 29.99,
                             'is_active' => true,
                         ]);

        $response->assertStatus(201);
    }

    /**
     * Test (a): Prove that no public registration endpoint exists.
     */
    public function test_no_public_registration_route_exists(): void
    {
        $response = $this->postJson('/api/register', [
            'name' => 'New User',
            'email' => 'newuser@example.com',
            'password' => 'password',
        ]);

        $response->assertStatus(404);
    }

    /**
     * Test (b): Prove that a user without roles.create gets 403 on role endpoints.
     */
    public function test_user_without_roles_create_gets_403_on_role_endpoints(): void
    {
        $staff = User::where('email', 'staff@apex.com')->first();

        // Attempt role CRUD - should be blocked (403)
        $response = $this->actingAs($staff)
                         ->postJson('/api/roles', [
                             'name' => 'New Staff Role',
                         ]);

        $response->assertStatus(403);
    }

    /**
     * Test (c): Prove that an invited user can only activate via a valid signed link (single-use).
     */
    public function test_invited_user_can_only_activate_via_valid_signed_link(): void
    {
        // 1. Authenticate as Tenant Admin (userA) to invite staff member
        $this->actingAs($this->userA);
        TenantContext::setTenant($this->tenantA);

        $frontDeskRole = Role::where('tenant_id', $this->tenantA->id)->where('name', 'Front Desk')->first();

        $response = $this->postJson('/api/staff/invite', [
            'name' => 'Jane Invite',
            'email' => 'jane.invite@apex.com',
            'role_ids' => [$frontDeskRole->id],
        ]);

        $response->assertStatus(201);
        $activationUrl = $response->json('activation_url');
        $userId = $response->json('user.id');

        $this->assertNotEmpty($activationUrl);

        // Logout admin
        $this->postJson('/api/logout');

        // 2. Try to activate the account WITHOUT a signature or with a forged signature
        $tamperedUrl = '/api/staff/activate/' . $userId . '?expires=' . time() . '&signature=badsignature';
        $response = $this->postJson($tamperedUrl, [
            'password' => 'newpassword123',
            'password_confirmation' => 'newpassword123',
        ]);

        $response->assertStatus(403); // Forbidden due to invalid signed url

        // 3. Activate the account WITH the valid signed activation link
        $queryParams = parse_url($activationUrl, PHP_URL_QUERY);
        $activationPath = '/api/staff/activate/' . $userId . '?' . $queryParams;

        $response = $this->postJson($activationPath, [
            'password' => 'newpassword123',
            'password_confirmation' => 'newpassword123',
        ]);

        $response->assertStatus(200)
                 ->assertJson(['message' => 'Account activated successfully. You may now log in.']);

        // Verify status changed to active in database
        $user = User::find($userId);
        $this->assertEquals('active', $user->status);

        // 4. Test Single-Use: Attempting to call activation URL again should fail
        $response = $this->postJson($activationPath, [
            'password' => 'anotherpassword',
            'password_confirmation' => 'anotherpassword',
        ]);

        $response->assertStatus(400) // Bad request because status is no longer 'invited'
                 ->assertJson(['message' => 'This activation link is invalid or has already been used.']);
    }

    /**
     * Module 03: Test Flexible Plan CRUD & Custom Cycle Validation Rules
     */
    public function test_flexible_plans_crud_and_validations(): void
    {
        $this->actingAs($this->userA);
        TenantContext::setTenant($this->tenantA);

        // 1. Validation failure: billing_cycle is custom_days but custom_cycle_days is null
        $response = $this->postJson('/api/plans', [
            'name' => 'Custom Days Plan Fail',
            'billing_cycle' => 'custom_days',
            'custom_cycle_days' => null,
            'price' => 50.00,
        ]);
        $response->assertStatus(422);

        // 2. Validation failure: billing_cycle is monthly but custom_cycle_days is provided
        $response = $this->postJson('/api/plans', [
            'name' => 'Monthly Plan Fail',
            'billing_cycle' => 'monthly',
            'custom_cycle_days' => 15,
            'price' => 50.00,
        ]);
        $response->assertStatus(422);

        // 3. Create Valid custom_days plan
        $planId = crypto_random_uuid_placeholder();
        $response = $this->postJson('/api/plans', [
            'id' => $planId,
            'name' => 'Bi-Weekly Premium',
            'billing_cycle' => 'custom_days',
            'custom_cycle_days' => 14,
            'price' => 25.00,
        ]);
        $response->assertStatus(201);
        $this->assertDatabaseHas('plans', ['id' => $planId, 'custom_cycle_days' => 14]);

        TenantContext::clear();
    }

    /**
     * Module 03: Test Subscription Assignment & Automatic Expiry Computation & Override
     */
    public function test_plan_assignment_expiry_computations(): void
    {
        $this->actingAs($this->userA);
        TenantContext::setTenant($this->tenantA);

        $member = Member::create([
            'id' => crypto_random_uuid_placeholder(),
            'first_name' => 'Alex',
            'last_name' => 'PlanTest',
            'status' => 'Active',
        ]);

        $plan = Plan::create([
            'id' => crypto_random_uuid_placeholder(),
            'name' => '3 Months Plan',
            'billing_cycle' => 'quarterly',
            'price' => 120.00,
        ]);

        // 1. Assign plan with automatic expiry calculation
        $startsAt = Carbon::now();
        $response = $this->postJson("/api/members/{$member->id}/plans", [
            'plan_id' => $plan->id,
            'starts_at' => $startsAt->toIso8601String(),
        ]);

        $response->assertStatus(201);
        $memberPlanId = $response->json('id');

        $memberPlan = MemberPlan::find($memberPlanId);
        $expectedExpiry = $startsAt->copy()->addMonths(3);
        $this->assertEquals($expectedExpiry->toDateString(), $memberPlan->expires_at->toDateString());

        // 2. Assign plan with manual expiry override (promo)
        $overrideExpiry = Carbon::now()->addDays(120);
        $response = $this->postJson("/api/members/{$member->id}/plans", [
            'plan_id' => $plan->id,
            'starts_at' => $startsAt->toIso8601String(),
            'expires_at' => $overrideExpiry->toIso8601String(),
        ]);

        $response->assertStatus(201);
        $overridePlanId = $response->json('id');
        $overridePlan = MemberPlan::find($overridePlanId);
        $this->assertEquals($overrideExpiry->toDateString(), $overridePlan->expires_at->toDateString());

        // 3. Test delete blocking when active subscriptions exist
        $response = $this->deleteJson("/api/plans/{$plan->id}");
        $response->assertStatus(400); // Blocked

        TenantContext::clear();
    }

    /**
     * Module 03: Test Subscription Freeze, Unfreeze, and Expiry Extension capping
     */
    public function test_plan_freeze_and_unfreeze_capping(): void
    {
        $this->actingAs($this->userA);
        TenantContext::setTenant($this->tenantA);

        $member = Member::create([
            'id' => crypto_random_uuid_placeholder(),
            'first_name' => 'Freezer',
            'last_name' => 'Test',
            'status' => 'Active',
        ]);

        // Plan with 10 days freeze allowance
        $plan = Plan::create([
            'id' => crypto_random_uuid_placeholder(),
            'name' => 'Freeze Restricted Plan',
            'billing_cycle' => 'monthly',
            'price' => 50.00,
            'freeze_allowance_days' => 10,
        ]);

        $startsAt = Carbon::now();
        $expiresAt = $startsAt->copy()->addMonth();

        $memberPlan = MemberPlan::create([
            'id' => crypto_random_uuid_placeholder(),
            'member_id' => $member->id,
            'plan_id' => $plan->id,
            'starts_at' => $startsAt,
            'expires_at' => $expiresAt,
            'status' => 'active',
        ]);

        // 1. Freeze the plan
        $response = $this->postJson("/api/member-plans/{$memberPlan->id}/freeze");
        $response->assertStatus(200);

        $memberPlan = $memberPlan->fresh();
        $this->assertEquals('frozen', $memberPlan->status);
        $this->assertNotNull($memberPlan->frozen_at);

        // 2. Manipulate DB to simulate that 12 days have passed since the freeze occurred
        // (exceeding the 10 days allowance cap)
        $memberPlan->update(['frozen_at' => Carbon::now()->subDays(12)]);

        // 3. Unfreeze the plan
        $response = $this->postJson("/api/member-plans/{$memberPlan->id}/unfreeze");
        $response->assertStatus(200);

        $memberPlan = $memberPlan->fresh();
        $this->assertEquals('active', $memberPlan->status);
        $this->assertNull($memberPlan->frozen_at);

        // Expect expires_at to be extended by exactly 10 days (cap) instead of 12 days
        $expectedNewExpiresAt = $expiresAt->copy()->addDays(10);
        $this->assertEquals($expectedNewExpiresAt->toDateString(), $memberPlan->expires_at->toDateString());
        $this->assertEquals(10, $memberPlan->total_frozen_days);

        TenantContext::clear();
    }

    /**
     * Module 03: Test standalone incrementSession() method and session limits expiring status
     */
    public function test_session_limit_increment_and_expiry(): void
    {
        $this->actingAs($this->userA);
        TenantContext::setTenant($this->tenantA);

        $member = Member::create([
            'id' => crypto_random_uuid_placeholder(),
            'first_name' => 'Sessions',
            'last_name' => 'Limits',
            'status' => 'Active',
        ]);

        // Plan with 3 sessions limit
        $plan = Plan::create([
            'id' => crypto_random_uuid_placeholder(),
            'name' => '3 Session Punch Card',
            'billing_cycle' => 'one_time',
            'price' => 30.00,
            'session_limit' => 3,
        ]);

        $memberPlan = MemberPlan::create([
            'id' => crypto_random_uuid_placeholder(),
            'member_id' => $member->id,
            'plan_id' => $plan->id,
            'starts_at' => Carbon::now(),
            'expires_at' => Carbon::now()->addYear(),
            'status' => 'active',
            'sessions_used' => 0,
        ]);

        // Increment 1st session
        $memberPlan->incrementSession();
        $this->assertEquals(1, $memberPlan->fresh()->sessions_used);
        $this->assertEquals('active', $memberPlan->fresh()->status);

        // Increment 2nd session
        $memberPlan->incrementSession();
        $this->assertEquals(2, $memberPlan->fresh()->sessions_used);
        $this->assertEquals('active', $memberPlan->fresh()->status);

        // Increment 3rd session (limit reached)
        $memberPlan->incrementSession();
        $this->assertEquals(3, $memberPlan->fresh()->sessions_used);
        $this->assertEquals('expired', $memberPlan->fresh()->status); // Changes to expired!

        TenantContext::clear();
    }
}

// Simple helper to generate random UUID for tests
if (!function_exists('crypto_random_uuid_placeholder')) {
    function crypto_random_uuid_placeholder(): string
    {
        return sprintf(
            '%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
            mt_rand(0, 0xffff), mt_rand(0, 0xffff),
            mt_rand(0, 0xffff),
            mt_rand(0, 0x0fff) | 0x4000,
            mt_rand(0, 0x3fff) | 0x8000,
            mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff)
        );
    }
}
