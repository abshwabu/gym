<?php

namespace App\Http\Controllers;

use App\Models\Attendance;
use App\Models\EmployeeProfile;
use App\Models\Expense;
use App\Models\Invoice;
use App\Models\LeaveRequest;
use App\Models\Member;
use App\Models\MemberPlan;
use App\Models\Payment;
use App\Models\PayrollRun;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class AnalyticsController extends Controller
{
    /**
     * GET /api/analytics/summary
     *
     * Tenant-scoped aggregate analytics for members, attendance, finance, plans, and HR.
     */
    public function summary(Request $request)
    {
        $request->validate([
            'from' => 'required|date',
            'to' => 'required|date|after_or_equal:from',
            'group_by' => 'nullable|string|in:day,week,month',
        ]);

        $from = Carbon::parse($request->input('from'))->startOfDay();
        $to = Carbon::parse($request->input('to'))->endOfDay();
        $groupBy = $request->input('group_by', 'day');

        return response()->json([
            'range' => [
                'from' => $from->toDateString(),
                'to' => $to->toDateString(),
                'group_by' => $groupBy,
            ],
            'members' => $this->memberMetrics($from, $to, $groupBy),
            'plans' => $this->planMetrics(),
            'attendance' => $this->attendanceMetrics($from, $to, $groupBy),
            'finance' => $this->financeMetrics($from, $to, $groupBy),
            'hr' => $this->hrMetrics($from, $to),
        ]);
    }

    private function periodKey(Carbon $date, string $groupBy): string
    {
        if ($groupBy === 'week') {
            return $date->format('o-\WW');
        }
        if ($groupBy === 'month') {
            return $date->format('Y-m');
        }

        return $date->format('Y-m-d');
    }

    private function memberMetrics(Carbon $from, Carbon $to, string $groupBy): array
    {
        $byStatus = Member::query()
            ->select('status', DB::raw('COUNT(*) as aggregate'))
            ->groupBy('status')
            ->pluck('aggregate', 'status')
            ->map(fn ($v) => (int) $v)
            ->all();

        $total = array_sum($byStatus);

        $signups = Member::query()
            ->whereBetween('created_at', [$from, $to])
            ->orderBy('created_at')
            ->get(['created_at']);

        $grouped = $signups->groupBy(fn ($m) => $this->periodKey(Carbon::parse($m->created_at), $groupBy));
        $newSignups = [];
        foreach ($grouped as $period => $items) {
            $newSignups[] = [
                'period' => $period,
                'count' => $items->count(),
            ];
        }

        return [
            'total' => $total,
            'by_status' => [
                'Active' => $byStatus['Active'] ?? 0,
                'Inactive' => $byStatus['Inactive'] ?? 0,
                'Frozen' => $byStatus['Frozen'] ?? 0,
            ],
            'new_signups_total' => $signups->count(),
            'new_signups' => $newSignups,
        ];
    }

    private function planMetrics(): array
    {
        $byStatus = MemberPlan::query()
            ->select('status', DB::raw('COUNT(*) as aggregate'))
            ->groupBy('status')
            ->pluck('aggregate', 'status')
            ->map(fn ($v) => (int) $v)
            ->all();

        $popular = MemberPlan::query()
            ->join('plans', 'plans.id', '=', 'member_plans.plan_id')
            ->where('member_plans.status', 'active')
            ->select(
                'member_plans.plan_id',
                'plans.name as plan_name',
                'plans.price',
                'plans.currency',
                DB::raw('COUNT(*) as active_count')
            )
            ->groupBy('member_plans.plan_id', 'plans.name', 'plans.price', 'plans.currency')
            ->orderByDesc('active_count')
            ->limit(10)
            ->get()
            ->map(fn ($row) => [
                'plan_id' => $row->plan_id,
                'plan_name' => $row->plan_name ?? 'Unknown',
                'price' => $row->price !== null ? (float) $row->price : null,
                'currency' => $row->currency,
                'active_count' => (int) $row->active_count,
            ])
            ->values()
            ->all();

        $expiringSoon = MemberPlan::query()
            ->where('status', 'active')
            ->whereBetween('expires_at', [now()->startOfDay(), now()->addDays(14)->endOfDay()])
            ->count();

        return [
            'subscriptions_by_status' => [
                'active' => $byStatus['active'] ?? 0,
                'frozen' => $byStatus['frozen'] ?? 0,
                'expired' => $byStatus['expired'] ?? 0,
                'cancelled' => $byStatus['cancelled'] ?? 0,
            ],
            'popular_plans' => $popular,
            'expiring_soon' => $expiringSoon,
        ];
    }

    private function attendanceMetrics(Carbon $from, Carbon $to, string $groupBy): array
    {
        $today = Attendance::query()
            ->whereDate('checked_in_at', now()->toDateString())
            ->count();

        $periodRows = Attendance::query()
            ->whereBetween('checked_in_at', [$from, $to])
            ->get(['checked_in_at', 'member_id', 'method']);

        $byPeriod = [];
        foreach ($periodRows->groupBy(fn ($a) => $this->periodKey(Carbon::parse($a->checked_in_at), $groupBy)) as $period => $items) {
            $byPeriod[] = [
                'period' => $period,
                'count' => $items->count(),
            ];
        }

        $peakHours = [];
        foreach ($periodRows->groupBy(fn ($a) => (int) Carbon::parse($a->checked_in_at)->format('G')) as $hour => $items) {
            $peakHours[] = [
                'hour' => (int) $hour,
                'count' => $items->count(),
            ];
        }
        usort($peakHours, fn ($a, $b) => $a['hour'] <=> $b['hour']);

        $byMethod = $periodRows
            ->groupBy(fn ($a) => $a->method ?: 'unknown')
            ->map(fn ($items) => $items->count())
            ->all();

        return [
            'today' => $today,
            'period_total' => $periodRows->count(),
            'unique_members' => $periodRows->pluck('member_id')->unique()->count(),
            'by_period' => $byPeriod,
            'peak_hours' => $peakHours,
            'by_method' => $byMethod,
        ];
    }

    private function financeMetrics(Carbon $from, Carbon $to, string $groupBy): array
    {
        $payments = Payment::query()
            ->whereBetween('paid_at', [$from, $to])
            ->orderBy('paid_at')
            ->get(['paid_at', 'amount', 'method']);

        $revenueByPeriod = [];
        foreach ($payments->groupBy(fn ($p) => $this->periodKey(Carbon::parse($p->paid_at), $groupBy)) as $period => $items) {
            $revenueByPeriod[] = [
                'period' => $period,
                'total_amount' => (float) $items->sum('amount'),
                'payment_count' => $items->count(),
            ];
        }

        $revenueByMethod = [];
        foreach ($payments->groupBy(fn ($p) => $p->method ?: 'other') as $method => $items) {
            $revenueByMethod[$method] = (float) $items->sum('amount');
        }

        $revenueTotal = (float) $payments->sum('amount');

        $expenses = Expense::query()
            ->whereBetween('incurred_at', [$from, $to])
            ->orderBy('incurred_at')
            ->get(['incurred_at', 'amount', 'category']);

        $expensesByPeriod = [];
        foreach ($expenses->groupBy(fn ($e) => $this->periodKey(Carbon::parse($e->incurred_at), $groupBy)) as $period => $items) {
            $expensesByPeriod[] = [
                'period' => $period,
                'total_amount' => (float) $items->sum('amount'),
                'expense_count' => $items->count(),
            ];
        }

        $expensesByCategory = [];
        foreach ($expenses->groupBy(fn ($e) => $e->category ?: 'other') as $category => $items) {
            $expensesByCategory[$category] = (float) $items->sum('amount');
        }

        $expensesTotal = (float) $expenses->sum('amount');

        $outstandingInvoices = Invoice::query()
            ->whereIn('status', ['unpaid', 'partial'])
            ->withSum('payments as paid_total', 'amount')
            ->get(['id', 'amount', 'due_at', 'status']);

        $aging = [
            'current' => 0.0,
            'days_1_30' => 0.0,
            'days_31_60' => 0.0,
            'days_60_plus' => 0.0,
        ];

        $outstandingTotal = 0.0;
        $now = now()->startOfDay();

        foreach ($outstandingInvoices as $invoice) {
            $balance = max(0, (float) $invoice->amount - (float) ($invoice->paid_total ?? 0));
            $outstandingTotal += $balance;

            if (!$invoice->due_at) {
                $aging['current'] += $balance;
                continue;
            }

            $due = Carbon::parse($invoice->due_at)->startOfDay();
            if ($due->gte($now)) {
                $aging['current'] += $balance;
            } else {
                $daysOverdue = $due->diffInDays($now);
                if ($daysOverdue <= 30) {
                    $aging['days_1_30'] += $balance;
                } elseif ($daysOverdue <= 60) {
                    $aging['days_31_60'] += $balance;
                } else {
                    $aging['days_60_plus'] += $balance;
                }
            }
        }

        return [
            'revenue_total' => $revenueTotal,
            'revenue_by_period' => $revenueByPeriod,
            'revenue_by_method' => $revenueByMethod,
            'expenses_total' => $expensesTotal,
            'expenses_by_period' => $expensesByPeriod,
            'expenses_by_category' => $expensesByCategory,
            'net' => $revenueTotal - $expensesTotal,
            'outstanding' => [
                'invoice_count' => $outstandingInvoices->count(),
                'total_amount' => round($outstandingTotal, 2),
                'aging' => array_map(fn ($v) => round($v, 2), $aging),
            ],
        ];
    }

    private function hrMetrics(Carbon $from, Carbon $to): array
    {
        $byStatus = EmployeeProfile::query()
            ->select('status', DB::raw('COUNT(*) as aggregate'))
            ->groupBy('status')
            ->pluck('aggregate', 'status')
            ->map(fn ($v) => (int) $v)
            ->all();

        $byType = EmployeeProfile::query()
            ->select('employment_type', DB::raw('COUNT(*) as aggregate'))
            ->groupBy('employment_type')
            ->pluck('aggregate', 'employment_type')
            ->map(fn ($v) => (int) $v)
            ->all();

        $leaveByStatus = LeaveRequest::query()
            ->select('status', DB::raw('COUNT(*) as aggregate'))
            ->groupBy('status')
            ->pluck('aggregate', 'status')
            ->map(fn ($v) => (int) $v)
            ->all();

        $payrollRuns = PayrollRun::query()
            ->where(function ($q) use ($from, $to) {
                $q->whereBetween('period_start', [$from->toDateString(), $to->toDateString()])
                    ->orWhereBetween('period_end', [$from->toDateString(), $to->toDateString()])
                    ->orWhere(function ($inner) use ($from, $to) {
                        $inner->where('period_start', '<=', $from->toDateString())
                            ->where('period_end', '>=', $to->toDateString());
                    });
            })
            ->with('lineItems')
            ->get();

        $payrollByStatus = [];
        $totalNetPay = 0.0;
        foreach ($payrollRuns as $run) {
            $status = $run->status ?: 'unknown';
            $payrollByStatus[$status] = ($payrollByStatus[$status] ?? 0) + 1;
            $totalNetPay += (float) $run->lineItems->sum('net_pay');
        }

        return [
            'headcount' => [
                'total' => array_sum($byStatus),
                'active' => $byStatus['active'] ?? 0,
                'on_leave' => $byStatus['on_leave'] ?? 0,
                'terminated' => $byStatus['terminated'] ?? 0,
            ],
            'by_employment_type' => $byType,
            'leave' => [
                'pending' => $leaveByStatus['pending'] ?? 0,
                'approved' => $leaveByStatus['approved'] ?? 0,
                'rejected' => $leaveByStatus['rejected'] ?? 0,
            ],
            'payroll' => [
                'runs_in_period' => $payrollRuns->count(),
                'total_net_pay' => round($totalNetPay, 2),
                'by_status' => $payrollByStatus,
            ],
        ];
    }
}
