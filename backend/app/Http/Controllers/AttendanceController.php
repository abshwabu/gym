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
            'member_plan_id' => 'nullable|uuid',
            'checked_in_at' => 'required|date',
            'method' => 'nullable|string|in:manual,qr_scan,kiosk,front_desk,fingerprint',
            'from_offline' => 'nullable|boolean',
        ]);

        $id = $request->input('id');
        $memberId = $request->input('member_id');
        $memberPlanId = $request->input('member_plan_id');
        $checkedInAt = Carbon::parse($request->input('checked_in_at'));
        $rawMethod = $request->input('method', 'manual');
        $method = in_array($rawMethod, ['manual', 'qr_scan', 'kiosk', 'fingerprint']) ? $rawMethod : 'manual';
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
            ? (MemberPlan::find($memberPlanId) ?: MemberPlan::where('client_uuid', $memberPlanId)->first()) 
            : $member->activeMemberPlan()->first();

        // 3. Online gate: no plan / expired / cancelled / frozen → deny
        // Offline (from_offline) still records and flags for review (append-only sync).
        if (!$memberPlan) {
            if (!$fromOffline) {
                return response()->json([
                    'message' => 'Cannot check in: member has no active membership plan.',
                ], 422);
            }
        } elseif (in_array($memberPlan->status, ['expired', 'cancelled', 'frozen'], true)) {
            if (!$fromOffline) {
                return response()->json([
                    'message' => "Cannot check in: member's plan is currently {$memberPlan->status}.",
                ], 422);
            }
        }

        // 4. Session Limit warning flag evaluation (total / per_week / per_month)
        $overLimit = $memberPlan ? $memberPlan->isSessionLimitReached($checkedInAt) : false;

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
            'flagged_for_review' => (!$memberPlan || in_array($memberPlan->status, ['expired', 'cancelled', 'frozen'], true)),
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
            'attendances.*.member_plan_id' => 'nullable|uuid',
            'attendances.*.checked_in_at' => 'required|date',
            'attendances.*.method' => 'nullable|string|in:manual,qr_scan,kiosk,front_desk,fingerprint',
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
                $rawMethod = $item['method'] ?? 'manual';
                $method = in_array($rawMethod, ['manual', 'qr_scan', 'kiosk', 'fingerprint']) ? $rawMethod : 'manual';

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
                    ? (MemberPlan::find($memberPlanId) ?: MemberPlan::where('client_uuid', $memberPlanId)->first()) 
                    : $member->activeMemberPlan()->first();

                // Advisory check: we always allow creations from offline sync
                $overLimit = $memberPlan ? $memberPlan->isSessionLimitReached($checkedInAt) : false;

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
                    'flagged_for_review' => (!$memberPlan || in_array($memberPlan->status, ['expired', 'cancelled', 'frozen'], true)),
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
                'session_limit_type' => null,
                'session_limit' => null,
                'sessions_used' => 0,
                'sessions_used_in_period' => 0,
                'sessions_remaining' => 'unlimited',
            ]);
        }

        $plan = $memberPlan->plan;
        $limit = $plan->session_limit;
        $usedInPeriod = $memberPlan->sessionsUsedTowardLimit();
        $hasCap = $plan->hasSessionCap();

        return response()->json([
            'plan_name' => $plan->name,
            'starts_at' => $memberPlan->starts_at,
            'expires_at' => $memberPlan->expires_at,
            'session_limit_type' => $plan->session_limit_type,
            'session_limit' => $limit,
            'sessions_used' => $memberPlan->sessions_used,
            'sessions_used_in_period' => $usedInPeriod,
            'sessions_remaining' => $hasCap ? max(0, $limit - $usedInPeriod) : 'unlimited',
        ]);
    }
}
