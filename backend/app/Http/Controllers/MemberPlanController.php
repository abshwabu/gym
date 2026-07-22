<?php

namespace App\Http\Controllers;

use App\Models\Member;
use App\Models\Plan;
use App\Models\MemberPlan;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class MemberPlanController extends Controller
{
    /**
     * List history of plans held by a member.
     */
    public function index($memberId)
    {
        $member = Member::findOrFail($memberId);
        $history = MemberPlan::where('member_id', $member->id)
            ->with('plan')
            ->orderBy('starts_at', 'desc')
            ->get();

        return response()->json($history);
    }

    /**
     * Assign a plan to a member.
     */
    public function store(Request $request, $memberId)
    {
        $member = Member::findOrFail($memberId);

        $request->validate([
            'plan_id' => 'required|uuid|exists:plans,id',
            'starts_at' => 'nullable|date',
            'expires_at' => 'nullable|date|after_or_equal:starts_at',
            'client_uuid' => 'nullable|uuid|unique:member_plans,client_uuid',
        ]);

        // Check for idempotency: if client_uuid already exists, return the existing record
        if ($request->filled('client_uuid')) {
            $existing = MemberPlan::where('client_uuid', $request->input('client_uuid'))->first();
            if ($existing) {
                return response()->json($existing->load('plan'), 200);
            }
        }

        $plan = Plan::findOrFail($request->input('plan_id'));

        $startsAt = $request->input('starts_at') ? Carbon::parse($request->input('starts_at')) : Carbon::now();
        
        // Compute expires_at based on billing cycle if not overridden manually
        $expiresAt = $request->input('expires_at')
            ? Carbon::parse($request->input('expires_at'))
            : $this->calculateExpiryDate($plan, $startsAt);

        $memberPlan = MemberPlan::create([
            'member_id' => $member->id,
            'plan_id' => $plan->id,
            'starts_at' => $startsAt,
            'expires_at' => $expiresAt,
            'status' => 'active',
            'sessions_used' => 0,
            'client_uuid' => $request->input('client_uuid'),
        ]);

        return response()->json($memberPlan->load('plan'), 201);
    }

    /**
     * Freeze subscription.
     */
    public function freeze($id)
    {
        $memberPlan = MemberPlan::findOrFail($id);

        if (!$memberPlan->freeze()) {
            return response()->json(['message' => 'Subscription cannot be frozen. It must be currently active.'], 400);
        }

        return response()->json($memberPlan->load('plan'));
    }

    /**
     * Unfreeze subscription.
     */
    public function unfreeze($id)
    {
        $memberPlan = MemberPlan::findOrFail($id);

        if (!$memberPlan->unfreeze()) {
            return response()->json(['message' => 'Subscription cannot be unfrozen. It must be currently frozen.'], 400);
        }

        return response()->json($memberPlan->load('plan'));
    }

    /**
     * Expiry calculator helper.
     */
    protected function calculateExpiryDate(Plan $plan, Carbon $startsAt): Carbon
    {
        $date = $startsAt->copy();
        switch ($plan->billing_cycle) {
            case 'one_time':
                return $date->addYears(10); // 10 years fallback for lifetime passes
            case 'weekly':
                return $date->addWeek();
            case 'monthly':
                return $date->addMonth();
            case 'quarterly':
                return $date->addMonths(3);
            case 'annual':
                return $date->addYear();
            case 'custom_days':
                return $date->addDays($plan->custom_cycle_days);
        }
        return $date;
    }
}
