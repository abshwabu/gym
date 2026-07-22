<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use App\Models\EmployeeProfile;
use App\Models\StaffAttendance;
use App\Models\LeaveRequest;
use App\Models\PayrollRun;
use App\Models\Expense;
use App\Services\TenantContext;
use App\Services\TenantProvisioning;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;
use Tests\TestCase;

class HRTest extends TestCase
{
    use RefreshDatabase;

    protected Tenant $tenant;
    protected User $user;
    protected User $salariedUser;
    protected User $hourlyUser;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed();

        $this->tenant = Tenant::where('slug', 'apex')->first();
        $this->user = User::where('email', 'admin@apex.com')->first();

        TenantContext::setTenant($this->tenant);

        // Create a couple of user records to attach employee profiles to
        $this->salariedUser = User::create([
            'id' => (string) Str::uuid(),
            'tenant_id' => $this->tenant->id,
            'name' => 'Salaried Staff',
            'email' => 'salaried@gym.com',
            'password' => bcrypt('password'),
            'status' => 'active',
        ]);

        $this->hourlyUser = User::create([
            'id' => (string) Str::uuid(),
            'tenant_id' => $this->tenant->id,
            'name' => 'Hourly Staff',
            'email' => 'hourly@gym.com',
            'password' => bcrypt('password'),
            'status' => 'active',
        ]);

        TenantContext::clear();
    }

    /**
     * Test payroll run generation for a mixed team (salaried + hourly).
     */
    public function test_payroll_run_generation_for_mixed_team(): void
    {
        TenantContext::setTenant($this->tenant);

        // Salaried Employee: $3000 / month
        $salariedEmp = EmployeeProfile::create([
            'user_id' => $this->salariedUser->id,
            'employee_code' => 'EMP-SAL',
            'hire_date' => '2026-01-01',
            'employment_type' => 'full_time',
            'salary_amount' => 3000.00,
            'salary_cycle' => 'monthly',
            'status' => 'active',
        ]);

        // Hourly Employee: $20 / hour
        $hourlyEmp = EmployeeProfile::create([
            'user_id' => $this->hourlyUser->id,
            'employee_code' => 'EMP-HRL',
            'hire_date' => '2026-01-01',
            'employment_type' => 'part_time',
            'salary_amount' => 20.00,
            'salary_cycle' => 'hourly',
            'status' => 'active',
        ]);

        // Record 10 hours (600 minutes) of attendance for hourly employee
        StaffAttendance::create([
            'id' => (string) Str::uuid(),
            'employee_id' => $hourlyEmp->id,
            'clock_in_at' => Carbon::parse('2026-07-10 08:00:00'),
            'clock_out_at' => Carbon::parse('2026-07-10 18:00:00'), // 10 hours
            'method' => 'manual',
        ]);

        TenantContext::clear();

        $response = $this->actingAs($this->user)
            ->postJson('/api/payroll-runs', [
                'period_start' => '2026-07-01',
                'period_end' => '2026-07-30', // 30 day period
            ]);

        $response->assertStatus(201);
        $data = $response->json();
        // 2 line items should be created
        $this->assertCount(2, $data['line_items']);

        // Check salaried net pay: should be flat $3000.00
        $salariedItem = collect($data['line_items'])->firstWhere('employee_id', $salariedEmp->id);
        $this->assertEquals(3000.00, $salariedItem['net_pay']);

        // Check hourly net pay: should be 10 hours * $20.00 = $200.00
        $hourlyItem = collect($data['line_items'])->firstWhere('employee_id', $hourlyEmp->id);
        $this->assertEquals(200.00, $hourlyItem['net_pay']);
    }

    /**
     * Test leave approval affecting salaried employee's pay.
     */
    public function test_leave_approval_deduction_for_salaried_employee(): void
    {
        TenantContext::setTenant($this->tenant);

        // Salaried Employee: $3000 / month
        $salariedEmp = EmployeeProfile::create([
            'user_id' => $this->salariedUser->id,
            'employee_code' => 'EMP-SAL-2',
            'hire_date' => '2026-01-01',
            'employment_type' => 'full_time',
            'salary_amount' => 3000.00,
            'salary_cycle' => 'monthly',
            'status' => 'active',
        ]);

        // Create approved unpaid leave for 3 days overlapping the period (July 5th to July 7th)
        LeaveRequest::create([
            'employee_id' => $salariedEmp->id,
            'type' => 'unpaid',
            'start_date' => '2026-07-05',
            'end_date' => '2026-07-07',
            'reason' => 'Unpaid Leave Test',
            'status' => 'approved',
            'approved_by' => $this->user->id,
            'decided_at' => now(),
        ]);

        TenantContext::clear();

        $response = $this->actingAs($this->user)
            ->postJson('/api/payroll-runs', [
                'period_start' => '2026-07-01',
                'period_end' => '2026-07-30', // 30 days
            ]);

        $response->assertStatus(201);
        $data = $response->json();

        // 3 days of unpaid leave should deduct: 3000.00 / 30 * 3 = 300.00
        // Net pay should be 3000.00 - 300.00 = 2700.00
        $item = collect($data['line_items'])->firstWhere('employee_id', $salariedEmp->id);
        $this->assertEquals(300.00, $item['deductions']);
        $this->assertEquals(2700.00, $item['net_pay']);
    }

    /**
     * Test staff clock-in/out idempotency on retry.
     */
    public function test_staff_attendance_idempotency_on_retry(): void
    {
        TenantContext::setTenant($this->tenant);
        $emp = EmployeeProfile::create([
            'user_id' => $this->hourlyUser->id,
            'employee_code' => 'EMP-IDEMP',
            'hire_date' => '2026-01-01',
            'employment_type' => 'part_time',
            'salary_amount' => 15.00,
            'salary_cycle' => 'hourly',
            'status' => 'active',
        ]);
        TenantContext::clear();

        $clockInId = (string) Str::uuid();
        $payload = [
            'id' => $clockInId,
            'employee_id' => $emp->id,
            'clock_in_at' => now()->toIso8601String(),
            'method' => 'kiosk',
        ];

        // 1st request
        $response1 = $this->actingAs($this->user)
            ->postJson('/api/staff-attendance/clock-in', $payload);
        $response1->assertStatus(201);
        $this->assertDatabaseCount('staff_attendance', 1);

        // 2nd request (retry)
        $response2 = $this->actingAs($this->user)
            ->postJson('/api/staff-attendance/clock-in', $payload);
        $response2->assertStatus(201);
        $this->assertDatabaseCount('staff_attendance', 1); // No duplicates
    }

    /**
     * Test finalizing a payroll run creates the salaries expense in finance.
     */
    public function test_finalizing_payroll_creates_expense_in_finance(): void
    {
        TenantContext::setTenant($this->tenant);

        $emp = EmployeeProfile::create([
            'user_id' => $this->salariedUser->id,
            'employee_code' => 'EMP-FIN',
            'hire_date' => '2026-01-01',
            'employment_type' => 'full_time',
            'salary_amount' => 2500.00,
            'salary_cycle' => 'monthly',
            'status' => 'active',
        ]);

        TenantContext::clear();

        // 1. Generate the draft
        $response1 = $this->actingAs($this->user)
            ->postJson('/api/payroll-runs', [
                'period_start' => '2026-07-01',
                'period_end' => '2026-07-31',
            ]);
        $response1->assertStatus(201);
        $runId = $response1->json('id');

        // 2. Finalize the run
        $response2 = $this->actingAs($this->user)
            ->patchJson("/api/payroll-runs/{$runId}/finalize");

        $response2->assertStatus(200);
        $this->assertEquals('finalized', $response2->json('status'));

        // 3. Verify expense was created with net pay totals ($2500.00)
        $this->assertDatabaseHas('expenses', [
            'tenant_id' => $this->tenant->id,
            'category' => 'salaries',
            'amount' => 2500.00,
        ]);
    }
}
