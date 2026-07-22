<?php

namespace App\Http\Controllers;

use App\Models\MembershipPlan;
use App\Models\SyncConflictLog;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class MembershipPlanController extends Controller
{
    /**
     * List all membership plans.
     */
    public function index()
    {
        $plans = MembershipPlan::orderBy('name')->get();
        return response()->json($plans);
    }

    /**
     * Create or update a membership plan (UPSERT with Last-Write-Wins conflict resolution).
     */
    public function store(Request $request)
    {
        $request->validate([
            'id' => 'required|uuid',
            'name' => 'required|string|max:255',
            'price' => 'required|numeric',
            'duration_days' => 'required|integer',
            'is_active' => 'boolean',
            'updated_at' => 'nullable|date',
        ]);

        $id = $request->input('id');
        $plan = MembershipPlan::find($id);

        if ($plan) {
            // Last-Write-Wins validation
            $clientUpdatedAt = $request->input('updated_at') ? Carbon::parse($request->input('updated_at')) : Carbon::now();
            $serverUpdatedAt = $plan->updated_at;

            if ($clientUpdatedAt->lt($serverUpdatedAt)) {
                // Client payload is older, create conflict log and keep server record
                SyncConflictLog::create([
                    'table_name' => 'membership_plans',
                    'record_id' => $plan->id,
                    'client_payload' => $request->all(),
                    'server_payload' => $plan->toArray(),
                    'resolved' => false,
                ]);

                return response()->json($plan, 200); // Return server version
            }

            // Client payload is newer (or equal), overwrite server record
            $plan->update([
                'name' => $request->input('name'),
                'price' => $request->input('price'),
                'duration_days' => $request->input('duration_days'),
                'is_active' => $request->input('is_active', true),
            ]);
        } else {
            // Record doesn't exist, create it with client UUID
            $plan = MembershipPlan::create([
                'id' => $id,
                'name' => $request->input('name'),
                'price' => $request->input('price'),
                'duration_days' => $request->input('duration_days'),
                'is_active' => $request->input('is_active', true),
            ]);
        }

        return response()->json($plan, 201);
    }
}
