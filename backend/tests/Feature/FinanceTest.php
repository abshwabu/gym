<?php

namespace Tests\Feature;

use App\Models\Invoice;
use App\Models\Payment;
use App\Models\Expense;
use App\Models\Member;
use App\Models\Plan;
use App\Models\MemberPlan;
use App\Models\Tenant;
use App\Models\User;
use App\Services\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;
use Tests\TestCase;

class FinanceTest extends TestCase
{
    use RefreshDatabase;

    protected Tenant $tenant;
    protected User $user;
    protected Member $member;
    protected Plan $plan;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed();

        $this->tenant = Tenant::where('slug', 'apex')->first();
        $this->user = User::where('email', 'admin@apex.com')->first();

        TenantContext::setTenant($this->tenant);

        // Create a test member
        $this->member = Member::create([
            'id' => (string) Str::uuid(),
            'first_name' => 'John',
            'last_name' => 'Doe',
            'email' => 'john.doe@test.com',
            'status' => 'Active',
        ]);

        // Create a test plan
        $this->plan = Plan::create([
            'id' => (string) Str::uuid(),
            'name' => 'Pro Monthly Plan',
            'billing_cycle' => 'monthly',
            'price' => 120.00,
            'currency' => 'USD',
            'is_active' => true,
        ]);

        TenantContext::clear();
    }

    /**
     * Test invoice auto-creation on plan assignment.
     */
    public function test_invoice_auto_creation_on_plan_assignment(): void
    {
        TenantContext::setTenant($this->tenant);

        $memberPlan = MemberPlan::create([
            'member_id' => $this->member->id,
            'plan_id' => $this->plan->id,
            'starts_at' => now(),
            'expires_at' => now()->addMonth(),
            'status' => 'active',
        ]);

        $this->assertDatabaseHas('invoices', [
            'tenant_id' => $this->tenant->id,
            'member_id' => $this->member->id,
            'member_plan_id' => $memberPlan->id,
            'amount' => 120.00,
            'status' => 'unpaid',
        ]);
    }

    /**
     * Test payment idempotency on retry.
     */
    public function test_payment_idempotency_on_retry(): void
    {
        $paymentId = (string) Str::uuid();
        $payload = [
            'id' => $paymentId,
            'member_id' => $this->member->id,
            'amount' => 50.00,
            'currency' => 'USD',
            'method' => 'card',
            'paid_at' => now()->toIso8601String(),
        ];

        // First post
        $response1 = $this->actingAs($this->user)
            ->postJson('/api/payments', $payload);

        $response1->assertStatus(201);
        $this->assertDatabaseCount('payments', 1);

        // Second post (retry)
        $response2 = $this->actingAs($this->user)
            ->postJson('/api/payments', $payload);

        $response2->assertStatus(201); // idempotent return of existing
        $this->assertDatabaseCount('payments', 1); // No duplicates
    }

    /**
     * Test partial and then full payment flips invoice status.
     */
    public function test_partial_then_full_payment_flips_invoice_status(): void
    {
        TenantContext::setTenant($this->tenant);

        // Create an invoice of 100.00
        $invoice = Invoice::create([
            'member_id' => $this->member->id,
            'amount' => 100.00,
            'currency' => 'USD',
            'status' => 'unpaid',
            'issued_at' => now(),
            'due_at' => now()->addDays(7),
        ]);

        TenantContext::clear();

        // 1. Pay 40.00 (partial)
        $response1 = $this->actingAs($this->user)
            ->postJson('/api/payments', [
                'id' => (string) Str::uuid(),
                'member_id' => $this->member->id,
                'invoice_id' => $invoice->id,
                'amount' => 40.00,
                'currency' => 'USD',
                'method' => 'cash',
                'paid_at' => now()->toIso8601String(),
            ]);

        $response1->assertStatus(201);
        $this->assertEquals('partial', $invoice->refresh()->status);

        // 2. Pay 60.00 (completes the 100.00)
        $response2 = $this->actingAs($this->user)
            ->postJson('/api/payments', [
                'id' => (string) Str::uuid(),
                'member_id' => $this->member->id,
                'invoice_id' => $invoice->id,
                'amount' => 60.00,
                'currency' => 'USD',
                'method' => 'cash',
                'paid_at' => now()->toIso8601String(),
            ]);

        $response2->assertStatus(201);
        $this->assertEquals('paid', $invoice->refresh()->status);
    }

    /**
     * Test revenue report aggregates correctly across a date range.
     */
    public function test_revenue_report_aggregates_correctly(): void
    {
        TenantContext::setTenant($this->tenant);

        // Create payments on different days
        Payment::create([
            'id' => (string) Str::uuid(),
            'member_id' => $this->member->id,
            'amount' => 150.00,
            'currency' => 'USD',
            'method' => 'card',
            'paid_at' => Carbon::parse('2026-07-10 10:00:00'),
            'recorded_by' => $this->user->id,
        ]);

        Payment::create([
            'id' => (string) Str::uuid(),
            'member_id' => $this->member->id,
            'amount' => 200.00,
            'currency' => 'USD',
            'method' => 'cash',
            'paid_at' => Carbon::parse('2026-07-11 12:00:00'),
            'recorded_by' => $this->user->id,
        ]);

        // A payment outside the report range
        Payment::create([
            'id' => (string) Str::uuid(),
            'member_id' => $this->member->id,
            'amount' => 500.00,
            'currency' => 'USD',
            'method' => 'cash',
            'paid_at' => Carbon::parse('2026-07-20 12:00:00'),
            'recorded_by' => $this->user->id,
        ]);

        TenantContext::clear();

        $response = $this->actingAs($this->user)
            ->getJson('/api/finance/reports/revenue?from=2026-07-09&to=2026-07-12&group_by=day');

        $response->assertStatus(200);
        $data = $response->json();

        // Should return aggregates for 2026-07-10 and 2026-07-11
        $this->assertCount(2, $data);
        
        $this->assertEquals('2026-07-10', $data[0]['period']);
        $this->assertEquals(150.00, $data[0]['total_amount']);

        $this->assertEquals('2026-07-11', $data[1]['period']);
        $this->assertEquals(200.00, $data[1]['total_amount']);
    }
}
