<?php

namespace App\Http\Controllers;

use App\Models\PayrollRun;
use App\Models\PayrollLineItem;
use App\Models\EmployeeProfile;
use App\Models\StaffAttendance;
use App\Models\LeaveRequest;
use App\Models\Expense;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class PayrollController extends Controller
{
    /**
     * POST /api/payroll-runs
     * Generate a draft payroll run for a period.
     */
    public function store(Request $request)
    {
        $request->validate([
            'period_start' => 'required|date',
            'period_end' => 'required|date|after_or_equal:period_start',
        ]);

        $periodStart = Carbon::parse($request->input('period_start'))->startOfDay();
        $periodEnd = Carbon::parse($request->input('period_end'))->endOfDay();

        // 1. Find all active employees
        $employees = EmployeeProfile::where('status', 'active')->get();

        if ($employees->isEmpty()) {
            return response()->json(['message' => 'No active employees found to generate payroll.'], 422);
        }

        return DB::transaction(function () use ($periodStart, $periodEnd, $employees) {
            $payrollRun = PayrollRun::create([
                'period_start' => $periodStart,
                'period_end' => $periodEnd,
                'status' => 'draft',
                'generated_at' => Carbon::now(),
            ]);

            $periodDays = $periodStart->copy()->startOfDay()->diffInDays($periodEnd->copy()->startOfDay()) + 1;

            foreach ($employees as $employee) {
                $baseSalary = 0.0;
                $deductions = 0.0;
                $bonuses = 0.0;

                if ($employee->salary_cycle === 'hourly') {
                    // Hourly employee: sum work attendance durations
                    $attendances = StaffAttendance::where('employee_id', $employee->id)
                        ->whereBetween('clock_in_at', [
                            $periodStart->toIso8601String(),
                            $periodEnd->toIso8601String()
                        ])
                        ->whereNotNull('clock_out_at')
                        ->get();

                    $totalHours = 0.0;
                    foreach ($attendances as $att) {
                        $diffSeconds = $att->clock_in_at->diffInSeconds($att->clock_out_at);
                        $totalHours += $diffSeconds / 3600.0;
                    }

                    $baseSalary = $totalHours * (float)$employee->salary_amount;
                } else {
                    // Monthly salaried employee
                    $baseSalary = (float)$employee->salary_amount;

                    // Deduct for approved unpaid leave
                    $unpaidLeaves = LeaveRequest::where('employee_id', $employee->id)
                        ->where('status', 'approved')
                        ->where('type', 'unpaid')
                        ->where(function ($query) use ($periodStart, $periodEnd) {
                            $query->where('start_date', '<=', $periodEnd)
                                  ->where('end_date', '>=', $periodStart);
                        })
                        ->get();

                    $totalUnpaidDays = 0;
                    foreach ($unpaidLeaves as $leave) {
                        $start = Carbon::parse(max($leave->start_date->toDateString(), $periodStart->toDateString()));
                        $end = Carbon::parse(min($leave->end_date->toDateString(), $periodEnd->toDateString()));
                        $totalUnpaidDays += $start->diffInDays($end) + 1;
                    }

                    if ($totalUnpaidDays > 0) {
                        $deductions = ($baseSalary / $periodDays) * $totalUnpaidDays;
                    }
                }

                $netPay = max(0.0, $baseSalary - $deductions + $bonuses);

                PayrollLineItem::create([
                    'payroll_run_id' => $payrollRun->id,
                    'employee_id' => $employee->id,
                    'base_salary' => $baseSalary,
                    'deductions' => $deductions,
                    'bonuses' => $bonuses,
                    'net_pay' => $netPay,
                ]);
            }

            return response()->json($payrollRun->load('lineItems.employee.user'), 201);
        });
    }

    /**
     * PATCH /api/payroll-runs/{id}/finalize
     * Finalize payroll run and trigger finance expense creation.
     */
    public function finalize(Request $request, $id)
    {
        $payrollRun = PayrollRun::findOrFail($id);

        if ($payrollRun->status !== 'draft') {
            return response()->json(['message' => 'Payroll run is already finalized or paid.'], 422);
        }

        return DB::transaction(function () use ($payrollRun, $request) {
            $payrollRun->update([
                'status' => 'finalized',
                'finalized_at' => Carbon::now(),
            ]);

            $totalNetPay = $payrollRun->lineItems()->sum('net_pay');

            // Trigger finance integration: create salaries expense
            Expense::create([
                'tenant_id' => $payrollRun->tenant_id,
                'category' => 'salaries',
                'amount' => $totalNetPay,
                'currency' => 'USD',
                'incurred_at' => Carbon::now(),
                'notes' => "Salaries payroll run reference {$payrollRun->id} (period: {$payrollRun->period_start->toDateString()} to {$payrollRun->period_end->toDateString()})",
                'recorded_by' => $request->user()?->id,
            ]);

            return response()->json($payrollRun->load('lineItems.employee.user'));
        });
    }
}
