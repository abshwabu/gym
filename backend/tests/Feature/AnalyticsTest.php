<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Expense;
use App\Models\Invoice;
use App\Models\Member;
use App\Models\Payment;
use App\Models\Plan;
use App\Models\MemberPlan;
use App\Models\Privilege;
use App\Models\Role;
use App\Models\Tenant;
use App\Models\User;
use App\Services\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;
use Tests\TestCase;

class AnalyticsTest extends TestCase
{
    use RefreshDatabase;

    protected Tenant $tenant;
    protected User $owner;
    protected Member $member;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed();

        $this->tenant = Tenant::where('slug', 'apex')->firstOrFail();
        $this->owner = User::where('email', 'admin@apex.com')->firstOrFail();

        TenantContext::setTenant($this->tenant);

        $this->member = Member::create([
            'id' => (string) Str::uuid(),
            'first_name' => 'Analytics',
            'last_name' => 'Member',
            'email' => 'analytics.member@test.com',
            'status' => 'Active',
        ]);

        // Place signup inside the analytics window under test
        Member::where('id', $this->member->id)->update([
            'created_at' => Carbon::parse('2026-07-10 09:00:00'),
            'updated_at' => Carbon::parse('2026-07-10 09:00:00'),
        ]);
        $this->member->refresh();

        $plan = Plan::create([
            'id' => (string) Str::uuid(),
            'name' => 'Analytics Monthly',
            'billing_cycle' => 'monthly',
            'price' => 99.00,
            'currency' => 'USD',
            'is_active' => true,
        ]);

        MemberPlan::create([
            'member_id' => $this->member->id,
            'plan_id' => $plan->id,
            'starts_at' => Carbon::parse('2026-07-01'),
            'expires_at' => Carbon::parse('2026-08-01'),
            'status' => 'active',
        ]);

        Attendance::create([
            'id' => (string) Str::uuid(),
            'member_id' => $this->member->id,
            'checked_in_at' => Carbon::parse('2026-07-11 08:30:00'),
            'checked_in_by' => $this->owner->id,
            'method' => 'manual',
        ]);

        Attendance::create([
            'id' => (string) Str::uuid(),
            'member_id' => $this->member->id,
            'checked_in_at' => Carbon::parse('2026-07-11 18:00:00'),
            'checked_in_by' => $this->owner->id,
            'method' => 'qr_scan',
        ]);

        Payment::create([
            'id' => (string) Str::uuid(),
            'member_id' => $this->member->id,
            'amount' => 99.00,
            'currency' => 'USD',
            'method' => 'card',
            'paid_at' => Carbon::parse('2026-07-11 12:00:00'),
            'recorded_by' => $this->owner->id,
        ]);

        Expense::create([
            'id' => (string) Str::uuid(),
            'category' => 'utilities',
            'amount' => 40.00,
            'currency' => 'USD',
            'incurred_at' => Carbon::parse('2026-07-11 10:00:00'),
            'recorded_by' => $this->owner->id,
        ]);

        Invoice::create([
            'member_id' => $this->member->id,
            'amount' => 50.00,
            'currency' => 'USD',
            'status' => 'unpaid',
            'issued_at' => Carbon::parse('2026-07-01'),
            'due_at' => Carbon::parse('2026-07-05'),
        ]);

        TenantContext::clear();
    }

    public function test_analytics_summary_aggregates_key_metrics(): void
    {
        $response = $this->actingAs($this->owner)
            ->getJson('/api/analytics/summary?from=2026-07-09&to=2026-07-12&group_by=day');

        $response->assertStatus(200);
        $response->assertJsonPath('range.from', '2026-07-09');
        $response->assertJsonPath('range.to', '2026-07-12');
        $response->assertJsonPath('range.group_by', 'day');

        $data = $response->json();

        $this->assertGreaterThanOrEqual(1, $data['members']['total']);
        $this->assertGreaterThanOrEqual(1, $data['members']['by_status']['Active']);
        $this->assertGreaterThanOrEqual(1, $data['members']['new_signups_total']);

        $this->assertEquals(2, $data['attendance']['period_total']);
        $this->assertEquals(1, $data['attendance']['unique_members']);
        $this->assertArrayHasKey('manual', $data['attendance']['by_method']);
        $this->assertArrayHasKey('qr_scan', $data['attendance']['by_method']);

        $this->assertEquals(99.0, $data['finance']['revenue_total']);
        $this->assertEquals(40.0, $data['finance']['expenses_total']);
        $this->assertEquals(59.0, $data['finance']['net']);
        $this->assertGreaterThanOrEqual(1, $data['finance']['outstanding']['invoice_count']);
        $this->assertGreaterThanOrEqual(50.0, $data['finance']['outstanding']['total_amount']);

        $this->assertGreaterThanOrEqual(1, $data['plans']['subscriptions_by_status']['active']);
        $this->assertNotEmpty($data['plans']['popular_plans']);
        $this->assertArrayHasKey('headcount', $data['hr']);
    }

    public function test_analytics_summary_requires_privilege(): void
    {
        TenantContext::setTenant($this->tenant);

        $role = Role::create([
            'tenant_id' => $this->tenant->id,
            'name' => 'No Analytics',
            'is_system_role' => false,
        ]);
        $viewMembers = Privilege::where('key', 'members.view')->first();
        $role->privileges()->sync([$viewMembers->id]);

        $staff = User::create([
            'id' => (string) Str::uuid(),
            'tenant_id' => $this->tenant->id,
            'name' => 'Limited Staff',
            'email' => 'limited.analytics@test.com',
            'password' => bcrypt('password'),
            'is_tenant_owner' => false,
            'status' => 'active',
        ]);
        $staff->roles()->attach($role->id);

        TenantContext::clear();

        $response = $this->actingAs($staff)
            ->getJson('/api/analytics/summary?from=2026-07-09&to=2026-07-12');

        $response->assertStatus(403);
    }

    public function test_analytics_summary_validates_date_range(): void
    {
        $response = $this->actingAs($this->owner)
            ->getJson('/api/analytics/summary?from=2026-07-12&to=2026-07-09');

        $response->assertStatus(422);
    }
}
