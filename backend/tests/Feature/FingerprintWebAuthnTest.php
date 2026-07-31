<?php

namespace Tests\Feature;

use App\Models\Member;
use App\Models\MemberWebAuthnCredential;
use App\Models\Tenant;
use App\Models\User;
use App\Services\TenantContext;
use App\Services\TenantProvisioning;
use App\Services\WebAuthnService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

class FingerprintWebAuthnTest extends TestCase
{
    use RefreshDatabase;

    protected Tenant $tenantA;
    protected User $userA;
    protected Tenant $tenantB;
    protected User $userB;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();

        $this->tenantA = Tenant::where('slug', 'apex')->first();
        $this->userA = User::where('email', 'admin@apex.com')->first();

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

    public function test_registration_options_are_tenant_scoped_and_require_auth(): void
    {
        $this->actingAs($this->userA);
        TenantContext::setTenant($this->tenantA);

        $member = Member::create([
            'id' => crypto_random_uuid_placeholder(),
            'first_name' => 'Fprint',
            'last_name' => 'Member',
            'status' => 'Active',
        ]);

        $response = $this->postJson("/api/members/{$member->id}/fingerprints/register/options", [], [
            'Origin' => 'http://localhost:8000',
        ]);

        $response->assertStatus(200)
            ->assertJsonStructure([
                'challenge',
                'rp' => ['id', 'name'],
                'user' => ['id', 'name', 'displayName'],
                'pubKeyCredParams',
                'authenticatorSelection',
            ]);

        $this->assertEquals('localhost', $response->json('rp.id'));

        TenantContext::clear();
    }

    public function test_authenticate_options_fail_when_no_fingerprints_enrolled(): void
    {
        $this->actingAs($this->userA);
        TenantContext::setTenant($this->tenantA);

        $response = $this->postJson('/api/fingerprint/authenticate/options', [], [
            'Origin' => 'http://localhost:8000',
        ]);

        $response->assertStatus(422)
            ->assertJsonFragment(['message' => 'No fingerprints enrolled yet. Enroll a member fingerprint first.']);

        TenantContext::clear();
    }

    public function test_fingerprint_credentials_are_isolated_between_tenants(): void
    {
        $this->actingAs($this->userA);
        TenantContext::setTenant($this->tenantA);

        $memberA = Member::create([
            'id' => crypto_random_uuid_placeholder(),
            'first_name' => 'Apex',
            'last_name' => 'Athlete',
            'status' => 'Active',
        ]);

        MemberWebAuthnCredential::create([
            'id' => crypto_random_uuid_placeholder(),
            'member_id' => $memberA->id,
            'credential_id' => 'cred-apex-1',
            'public_key' => "-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE\n-----END PUBLIC KEY-----\n",
            'sign_count' => 0,
            'device_name' => 'Reader A',
        ]);

        $listA = $this->getJson("/api/members/{$memberA->id}/fingerprints");
        $listA->assertStatus(200)->assertJson(['has_fingerprint' => true]);
        $this->assertCount(1, $listA->json('credentials'));

        // Switch to tenant B — should not see tenant A credentials / member
        TenantContext::clear();
        $this->actingAs($this->userB);
        TenantContext::setTenant($this->tenantB);

        $cross = $this->getJson("/api/members/{$memberA->id}/fingerprints");
        $cross->assertStatus(404);

        $authOptions = $this->postJson('/api/fingerprint/authenticate/options', [], [
            'Origin' => 'http://localhost:8000',
        ]);
        $authOptions->assertStatus(422);

        TenantContext::clear();
    }

    public function test_finish_registration_rejects_expired_challenge(): void
    {
        $this->actingAs($this->userA);
        TenantContext::setTenant($this->tenantA);

        $member = Member::create([
            'id' => crypto_random_uuid_placeholder(),
            'first_name' => 'Challenge',
            'last_name' => 'Fail',
            'status' => 'Active',
        ]);

        $clientData = base64_encode(json_encode([
            'type' => 'webauthn.create',
            'challenge' => 'not-a-real-challenge',
            'origin' => 'http://localhost:8000',
        ]));
        $clientData = rtrim(strtr($clientData, '+/', '-_'), '=');

        $response = $this->postJson("/api/members/{$member->id}/fingerprints/register", [
            'id' => 'fake-cred-id',
            'publicKey' => rtrim(strtr(base64_encode(random_bytes(91)), '+/', '-_'), '='),
            'clientDataJSON' => $clientData,
        ], [
            'Origin' => 'http://localhost:8000',
        ]);

        $response->assertStatus(422);

        TenantContext::clear();
    }

    public function test_attendance_accepts_fingerprint_method(): void
    {
        $this->actingAs($this->userA);
        TenantContext::setTenant($this->tenantA);

        $member = Member::create([
            'id' => crypto_random_uuid_placeholder(),
            'first_name' => 'Biometric',
            'last_name' => 'Checkin',
            'status' => 'Active',
        ]);

        $attendanceId = crypto_random_uuid_placeholder();
        $response = $this->postJson('/api/attendances', [
            'id' => $attendanceId,
            'member_id' => $member->id,
            'checked_in_at' => now()->toIso8601String(),
            'method' => 'fingerprint',
        ]);

        $response->assertStatus(201);
        $this->assertDatabaseHas('attendances', [
            'id' => $attendanceId,
            'method' => 'fingerprint',
        ]);

        TenantContext::clear();
    }

    public function test_webauthn_service_issue_and_consume_challenge(): void
    {
        $service = app(WebAuthnService::class);
        $challenge = $service->createChallenge('register', 'member-1');

        $this->assertNotEmpty($challenge);
        $this->assertTrue(Cache::has('webauthn_challenge:'.hash('sha256', $challenge)));

        $service->consumeChallenge($challenge, 'register', 'member-1');
        $this->assertFalse(Cache::has('webauthn_challenge:'.hash('sha256', $challenge)));
    }
}
