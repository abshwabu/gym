<?php

namespace App\Http\Controllers;

use App\Models\Attendance;
use App\Models\Member;
use App\Models\MemberPlan;
use App\Services\TenantContext;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class AttendanceController extends Controller
{
    /**
     * List and filter attendance records.
     */
    public function index(Request $request)
    {
        $query = Attendance::with(['member', 'memberPlan.plan', 'staffUser']);

        if ($request->filled('date')) {
            $query->whereDate('checked_in_at', $request->input('date'));
        }

        if ($request->filled('member_id')) {
            $query->where('member_id', $request->input('member_id'));
        }

        $attendances = $query->orderBy('checked_in_at', 'desc')->paginate(20);

        return response()->json($attendances);
    }

    /**
     * Log a member check-in (Idempotent single endpoint).
     */
    public function store(Request $request)
    {
        $request->validate([
            'id' => 'required|uuid',
            'member_id' => 'required|uuid|exists:members,id',
            'member_plan_id' => 'nullable|uuid|exists:member_plans,id',
            'checked_in_at' => 'required|date',
            'method' => 'nullable|string|in:manual,qr_scan,kiosk',
            'from_offline' => 'nullable|boolean',
        ]);

        $id = $request->input('id');
        $memberId = $request->input('member_id');
        $memberPlanId = $request->input('member_plan_id');
        $checkedInAt = Carbon::parse($request->input('checked_in_at'));
        $method = $request->input('method', 'manual');
        $fromOffline = $request->input('from_offline', false);

        // 1. Idempotency Check
        $existing = Attendance::find($id);
        if ($existing) {
            return response()->json($existing->load(['member', 'memberPlan.plan']), 200);
        }

        $member = Member::findOrFail($memberId);

        // 2. Resolve target MemberPlan subscription
        // If not specified, look up their current active plan
        $memberPlan = $memberPlanId 
            ? MemberPlan::find($memberPlanId) 
            : $member->activeMemberPlan()->first();

        // 3. Advisory Check for Expired / Cancelled Subscriptions
        if ($memberPlan && in_array($memberPlan->status, ['expired', 'cancelled'])) {
            if (!$fromOffline) {
                // Regular online check-in: Reject
                return response()->json([
                    'message' => "Cannot check in: member's plan is currently {$memberPlan->status}."
                ], 422);
            }
        }

        // 4. Session Limit warning flag evaluation
        $overLimit = false;
        if ($memberPlan && $memberPlan->plan && $memberPlan->plan->session_limit !== null) {
            if ($memberPlan->sessions_used >= $memberPlan->plan->session_limit) {
                $overLimit = true;
            }
        }

        // 5. Create the check-in record
        $attendance = Attendance::create([
            'id' => $id,
            'member_id' => $member->id,
            'member_plan_id' => $memberPlan ? $memberPlan->id : null,
            'checked_in_at' => $checkedInAt,
            'checked_in_by' => auth()->id(),
            'method' => $method,
            'synced_at' => Carbon::now(), // Mark backend persistence timestamp
        ]);

        // 6. Increment sessions used (even if over limit, we record the visit)
        if ($memberPlan) {
            $memberPlan->incrementSession();
        }

        return response()->json([
            'attendance' => $attendance->load(['member', 'memberPlan.plan']),
            'over_limit' => $overLimit,
            'flagged_for_review' => ($memberPlan && in_array($memberPlan->status, ['expired', 'cancelled'])),
        ], 201);
    }

    /**
     * Bulk upload sync endpoint for append-only attendance records.
     */
    public function bulk(Request $request)
    {
        $request->validate([
            'attendances' => 'required|array',
            'attendances.*.id' => 'required|uuid',
            'attendances.*.member_id' => 'required|uuid|exists:members,id',
            'attendances.*.member_plan_id' => 'nullable|uuid|exists:member_plans,id',
            'attendances.*.checked_in_at' => 'required|date',
            'attendances.*.method' => 'nullable|string|in:manual,qr_scan,kiosk',
        ]);

        $batch = $request->input('attendances');
        $results = [];

        // Run batch inside transaction for transactional integrity
        DB::transaction(function () use ($batch, &$results) {
            foreach ($batch as $item) {
                $id = $item['id'];
                $memberId = $item['member_id'];
                $memberPlanId = $item['member_plan_id'] ?? null;
                $checkedInAt = Carbon::parse($item['checked_in_at']);
                $method = $item['method'] ?? 'manual';

                // Check duplicate
                $existing = Attendance::find($id);
                if ($existing) {
                    $results[] = [
                        'id' => $id,
                        'status' => 'duplicate',
                        'over_limit' => false,
                        'flagged_for_review' => false,
                    ];
                    continue;
                }

                $member = Member::find($memberId);
                if (!$member) {
                    $results[] = [
                        'id' => $id,
                        'status' => 'failed',
                        'error' => 'Member not found',
                    ];
                    continue;
                }

                $memberPlan = $memberPlanId 
                    ? MemberPlan::find($memberPlanId) 
                    : $member->activeMemberPlan()->first();

                // Advisory check: we always allow creations from offline sync
                $overLimit = false;
                if ($memberPlan && $memberPlan->plan && $memberPlan->plan->session_limit !== null) {
                    if ($memberPlan->sessions_used >= $memberPlan->plan->session_limit) {
                        $overLimit = true;
                    }
                }

                $attendance = Attendance::create([
                    'id' => $id,
                    'member_id' => $member->id,
                    'member_plan_id' => $memberPlan ? $memberPlan->id : null,
                    'checked_in_at' => $checkedInAt,
                    'checked_in_by' => auth()->id(),
                    'method' => $method,
                    'synced_at' => Carbon::now(),
                ]);

                if ($memberPlan) {
                    $memberPlan->incrementSession();
                }

                $results[] = [
                    'id' => $id,
                    'status' => 'created',
                    'over_limit' => $overLimit,
                    'flagged_for_review' => ($memberPlan && in_array($memberPlan->status, ['expired', 'cancelled'])),
                ];
            }
        });

        return response()->json(['results' => $results]);
    }

    /**
     * Retrieve a summary of check-ins for the member's current active subscription period.
     */
    public function summary($memberId)
    {
        $member = Member::findOrFail($memberId);
        $memberPlan = $member->activeMemberPlan()->with('plan')->first();

        if (!$memberPlan) {
            return response()->json([
                'plan_name' => null,
                'starts_at' => null,
                'expires_at' => null,
                'session_limit' => null,
                'sessions_used' => 0,
                'sessions_remaining' => 'unlimited',
            ]);
        }

        $limit = $memberPlan->plan->session_limit;
        $used = $memberPlan->sessions_used;

        return response()->json([
            'plan_name' => $memberPlan->plan->name,
            'starts_at' => $memberPlan->starts_at,
            'expires_at' => $memberPlan->expires_at,
            'session_limit' => $limit,
            'sessions_used' => $used,
            'sessions_remaining' => $limit !== null ? max(0, $limit - $used) : 'unlimited',
        ]);
    }
}
