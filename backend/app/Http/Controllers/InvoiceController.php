<?php

namespace App\Http\Controllers;

use App\Models\Invoice;
use App\Models\Member;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Validation\ValidationException;

class InvoiceController extends Controller
{
    /**
     * GET /api/invoices
     */
    public function index(Request $request)
    {
        $query = Invoice::with('member', 'memberPlan.plan');

        if ($request->has('status')) {
            $query->where('status', $request->input('status'));
        }

        if ($request->has('member_id')) {
            $query->where('member_id', $request->input('member_id'));
        }

        $invoices = $query->orderBy('created_at', 'desc')->get();
        return response()->json($invoices);
    }

    /**
     * POST /api/invoices
     *
     * Amount is computed server-side:
     * (active plan price × months) + optional penalty.
     */
    public function store(Request $request)
    {
        $request->validate([
            'member_id' => 'required|uuid|exists:members,id',
            'months' => 'required|integer|min:1|max:36',
            'penalty' => 'nullable|numeric|min:0',
            'currency' => 'nullable|string|max:3',
            'status' => 'nullable|string|in:unpaid,partial,paid,void',
            'issued_at' => 'required|date',
            'due_at' => 'required|date',
            'client_uuid' => 'nullable|uuid|unique:invoices,client_uuid',
        ]);

        $member = Member::with('activeMemberPlan.plan')->findOrFail($request->input('member_id'));
        $memberPlan = $member->activeMemberPlan;

        if (!$memberPlan || !$memberPlan->plan) {
            throw ValidationException::withMessages([
                'member_id' => ['Member has no active membership plan.'],
            ]);
        }

        $months = (int) $request->input('months');
        $penalty = round((float) ($request->input('penalty') ?? 0), 2);
        $planPrice = (float) $memberPlan->plan->price;
        $amount = round(($planPrice * $months) + $penalty, 2);

        $invoice = Invoice::create([
            'member_id' => $member->id,
            'member_plan_id' => $memberPlan->id,
            'amount' => $amount,
            'currency' => $request->input('currency', $memberPlan->plan->currency ?: 'USD'),
            'status' => $request->input('status', 'unpaid'),
            'issued_at' => Carbon::parse($request->input('issued_at')),
            'due_at' => Carbon::parse($request->input('due_at')),
            'client_uuid' => $request->input('client_uuid'),
        ]);

        return response()->json($invoice->load('member', 'memberPlan.plan'), 201);
    }

    /**
     * PATCH /api/invoices/{id}
     */
    public function update(Request $request, Invoice $invoice)
    {
        $request->validate([
            'status' => 'nullable|string|in:unpaid,partial,paid,void',
            'due_at' => 'nullable|date',
            'amount' => 'nullable|numeric|min:0',
        ]);

        $invoice->update(
            $request->only(['status', 'due_at', 'amount'])
        );

        return response()->json($invoice->load('member', 'memberPlan.plan'));
    }
}
