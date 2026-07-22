<?php

namespace App\Http\Controllers;

use App\Models\Invoice;
use App\Models\Payment;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class FinanceReportController extends Controller
{
    /**
     * GET /api/finance/reports/revenue
     */
    public function revenue(Request $request)
    {
        $request->validate([
            'from' => 'required|date',
            'to' => 'required|date',
            'group_by' => 'nullable|string|in:day,week,month',
        ]);

        $from = Carbon::parse($request->input('from'))->startOfDay();
        $to = Carbon::parse($request->input('to'))->endOfDay();
        $groupBy = $request->input('group_by', 'day');

        $payments = Payment::whereBetween('paid_at', [$from, $to])
            ->orderBy('paid_at', 'asc')
            ->get();

        $grouped = $payments->groupBy(function ($payment) use ($groupBy) {
            $date = Carbon::parse($payment->paid_at);
            if ($groupBy === 'week') {
                return $date->format('o-\WW'); // E.g. "2026-W30"
            } elseif ($groupBy === 'month') {
                return $date->format('Y-m'); // E.g. "2026-07"
            } else {
                return $date->format('Y-m-d'); // E.g. "2026-07-22"
            }
        });

        $report = [];
        foreach ($grouped as $period => $items) {
            $report[] = [
                'period' => $period,
                'total_amount' => (float) $items->sum('amount'),
                'payment_count' => $items->count(),
            ];
        }

        return response()->json($report);
    }

    /**
     * GET /api/finance/reports/outstanding
     */
    public function outstanding()
    {
        $invoices = Invoice::with('member', 'memberPlan.plan')
            ->whereIn('status', ['unpaid', 'partial'])
            ->orderBy('due_at', 'asc')
            ->get();

        return response()->json($invoices);
    }
}
