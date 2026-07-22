<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use App\Services\TenantProvisioning;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\URL;
use Tests\TestCase;

class SuperAdminTest extends TestCase
{
    use RefreshDatabase;

    protected User $superAdmin;
    protected Tenant $tenant;
    protected User $tenantOwner;

    protected function setUp(): void
    {
        parent::setUp();

        // 1. Create a Super Admin account
        $this->superAdmin = User::create([
            'tenant_id' => null,
            'name' => 'Platform Super Admin',
            'email' => 'super@admin.test',
            'password' => Hash::make('secret123'),
            'is_super_admin' => true,
            'status' => 'active',
        ]);

        // 2. Provision a sample Tenant and Owner
        $provisioner = new TenantProvisioning();
        $this->tenant = $provisioner->provision(
            'Alpha Gym',
            'alpha',
            'active',
            [
                'name' => 'Alpha Owner',
                'email' => 'owner@alpha.com',
                'password' => 'password123',
                'status' => 'active',
            ]
        );

        $this->tenantOwner = User::withoutGlobalScopes()
            ->where('tenant_id', $this->tenant->id)
            ->where('is_tenant_owner', true)
            ->first();
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
     * Test normal tenant users require tenant slug.
     */
    public function test_normal_tenant_users_require_tenant_slug_to_login()
    {
        $response = $this->postJson('/api/login', [
            'email' => 'owner@alpha.com',
            'password' => 'password123',
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['tenant_slug']);
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
                'slug' => 'alpha',
                'owner_email' => 'owner@alpha.com',
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
     * Test super admin can provision new tenants.
     */
    public function test_super_admin_can_provision_a_new_tenant()
    {
        $response = $this->actingAs($this->superAdmin)
            ->postJson('/api/platform/tenants', [
                'name' => 'Beta Gym',
                'slug' => 'beta',
                'owner_name' => 'Beta Owner',
                'owner_email' => 'owner@beta.com',
            ]);

        $response->assertStatus(201)
            ->assertJsonStructure(['tenant', 'owner', 'activation_url']);

        $this->assertDatabaseHas('tenants', ['slug' => 'beta']);
        
        $newOwner = User::withoutGlobalScopes()
            ->where('email', 'owner@beta.com')
            ->first();
            
        $this->assertNotNull($newOwner);
        $this->assertEquals('invited', $newOwner->status);
    }

    /**
     * Test tenant suspension blocks logins.
     */
    public function test_tenant_suspension_blocks_logins()
    {
        // 1. Suspend the tenant
        $response = $this->actingAs($this->superAdmin)
            ->patchJson("/api/platform/tenants/{$this->tenant->id}/suspend");

        $response->assertStatus(200);
        $this->assertEquals('suspended', Tenant::find($this->tenant->id)->status);

        // 2. Attempt login as tenant owner
        $loginRes = $this->postJson('/api/login', [
            'tenant_slug' => 'alpha',
            'email' => 'owner@alpha.com',
            'password' => 'password123',
        ]);

        $loginRes->assertStatus(403)
            ->assertJsonFragment(['message' => 'Your tenant account is suspended.']);
    }

    /**
     * Test tenant activation allows logins again.
     */
    public function test_tenant_activation_restores_logins()
    {
        // 1. Suspend
        $this->tenant->update(['status' => 'suspended']);

        // 2. Activate
        $response = $this->actingAs($this->superAdmin)
            ->patchJson("/api/platform/tenants/{$this->tenant->id}/activate");

        $response->assertStatus(200);
        $this->assertEquals('active', Tenant::find($this->tenant->id)->status);

        // 3. Login
        $loginRes = $this->postJson('/api/login', [
            'tenant_slug' => 'alpha',
            'email' => 'owner@alpha.com',
            'password' => 'password123',
        ]);

        $loginRes->assertStatus(200);
    }

    /**
     * Test super admin can generate reset owner password activation link.
     */
    public function test_super_admin_can_generate_reset_owner_password_link()
    {
        $response = $this->actingAs($this->superAdmin)
            ->postJson("/api/platform/tenants/{$this->tenant->id}/reset-owner-password");

        $response->assertStatus(200)
            ->assertJsonStructure(['message', 'activation_url']);

        $owner = User::withoutGlobalScopes()->find($this->tenantOwner->id);
        $this->assertEquals('invited', $owner->status);
    }
}
