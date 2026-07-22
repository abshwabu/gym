<?php

namespace App\Http\Controllers;

use App\Models\Member;
use App\Models\SyncConflictLog;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class MemberController extends Controller
{
    /**
     * List all members.
     */
    public function index()
    {
        $members = Member::with('plan')->orderBy('first_name')->orderBy('last_name')->get();
        return response()->json($members);
    }

    /**
     * Create or update a member (UPSERT with Last-Write-Wins conflict resolution).
     */
    public function store(Request $request)
    {
        $request->validate([
            'id' => 'required|uuid',
            'first_name' => 'required|string|max:255',
            'last_name' => 'required|string|max:255',
            'email' => 'nullable|email|max:255',
            'phone' => 'nullable|string|max:50',
            'status' => 'required|string|max:50', // Active, Inactive, Frozen
            'membership_plan_id' => 'nullable|uuid|exists:membership_plans,id',
            'plan_expires_at' => 'nullable|date',
            'updated_at' => 'nullable|date',
        ]);

        $id = $request->input('id');
        $member = Member::find($id);

        if ($member) {
            // Last-Write-Wins validation
            $clientUpdatedAt = $request->input('updated_at') ? Carbon::parse($request->input('updated_at')) : Carbon::now();
            $serverUpdatedAt = $member->updated_at;

            if ($clientUpdatedAt->lt($serverUpdatedAt)) {
                // Client payload is older, log conflict and keep server record
                SyncConflictLog::create([
                    'table_name' => 'members',
                    'record_id' => $member->id,
                    'client_payload' => $request->all(),
                    'server_payload' => $member->toArray(),
                    'resolved' => false,
                ]);

                return response()->json($member->load('plan'), 200); // Return server version
            }

            // Overwrite database record with newer client payload
            $member->update([
                'first_name' => $request->input('first_name'),
                'last_name' => $request->input('last_name'),
                'email' => $request->input('email'),
                'phone' => $request->input('phone'),
                'status' => $request->input('status'),
                'membership_plan_id' => $request->input('membership_plan_id'),
                'plan_expires_at' => $request->input('plan_expires_at'),
            ]);
        } else {
            // Create a new member record with the client's UUID
            $member = Member::create([
                'id' => $id,
                'first_name' => $request->input('first_name'),
                'last_name' => $request->input('last_name'),
                'email' => $request->input('email'),
                'phone' => $request->input('phone'),
                'status' => $request->input('status', 'Active'),
                'membership_plan_id' => $request->input('membership_plan_id'),
                'plan_expires_at' => $request->input('plan_expires_at'),
            ]);
        }

        return response()->json($member->load('plan'), 201);
    }
}
