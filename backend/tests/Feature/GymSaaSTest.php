<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Member;
use App\Models\MembershipPlan;
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
                             'price' => 10.00,
                             'duration_days' => 30,
                         ]);

        $response->assertStatus(403);

        // Owner/Admin user (User A) creates membership plan
        $response = $this->actingAs($this->userA)
                         ->postJson('/api/plans', [
                             'id' => crypto_random_uuid_placeholder(),
                             'name' => 'Standard Monthly',
                             'price' => 29.99,
                             'duration_days' => 30,
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
        // Extract the query parameters from the generated signed url
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
