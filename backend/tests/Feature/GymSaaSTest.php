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
     * Proves a user from Tenant A cannot read or write a record belonging to Tenant B, even if they guess/forge the ID.
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
        // The global scope should prevent retrieving it.
        $this->actingAs($this->userA);
        
        // Emulate web request middleware setting tenant context
        TenantContext::setTenant($this->tenantA);

        $member = Member::find($memberB->id);
        $this->assertNull($member, "User from Tenant A should not be able to read Tenant B's records");

        // 3. Attempt to write a member record and forge the tenant_id in request input
        // Send a POST request to create a member, trying to specify tenant_id of Tenant B.
        $forgedMemberId = crypto_random_uuid_placeholder();
        $response = $this->postJson('/api/members', [
            'id' => $forgedMemberId,
            'tenant_id' => $this->tenantB->id, // FORGED tenant ID
            'first_name' => 'Spoofed',
            'last_name' => 'Member',
            'status' => 'Active',
        ]);

        $response->assertStatus(201);
        
        // Assert that the created member was forced to belong to Tenant A (User A's tenant),
        // completely ignoring the forged input value in the request.
        $createdMember = Member::find($forgedMemberId);
        $this->assertNotNull($createdMember);
        $this->assertEquals($this->tenantA->id, $createdMember->tenant_id, "Model creating event must force authenticated tenant ID");
        $this->assertNotEquals($this->tenantB->id, $createdMember->tenant_id, "Tenant ID parameter injection must be rejected");

        TenantContext::clear();
    }

    /**
     * Test server-side privilege checking.
     */
    public function test_privilege_authorization_middleware(): void
    {
        // Apex has a staff user created in seeder with only Front Desk role (no plans.create privilege)
        $staff = User::where('email', 'staff@apex.com')->first();

        // Staff user tries to create a plan (requires 'plans.create' or 'plans.manage')
        $response = $this->actingAs($staff)
                         ->postJson('/api/plans', [
                             'id' => crypto_random_uuid_placeholder(),
                             'name' => 'Unauthorized Plan',
                             'price' => 10.00,
                             'duration_days' => 30,
                         ]);

        $response->assertStatus(403); // Forbidden

        // Owner/Admin user (User A) creates membership plan
        $response = $this->actingAs($this->userA)
                         ->postJson('/api/plans', [
                             'id' => crypto_random_uuid_placeholder(),
                             'name' => 'Standard Monthly',
                             'price' => 29.99,
                             'duration_days' => 30,
                             'is_active' => true,
                         ]);

        $response->assertStatus(201); // Created
    }
}

// Simple helper to generate random UUID for tests
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
