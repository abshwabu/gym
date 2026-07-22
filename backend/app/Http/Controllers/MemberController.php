<?php

namespace App\Http\Controllers;

use App\Models\Member;
use App\Models\SyncConflict;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class MemberController extends Controller
{
    /**
     * List all members.
     */
    public function index()
    {
        $members = Member::with('activeMemberPlan.plan')->orderBy('first_name')->orderBy('last_name')->get();
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
                SyncConflict::create([
                    'entity_type' => 'members',
                    'entity_id' => $member->id,
                    'client_payload' => $request->all(),
                    'server_payload' => $member->toArray(),
                ]);

                return response()->json($member->load('activeMemberPlan.plan'), 200); // Return server version
            }

            // Overwrite database record with newer client payload
            $member->update([
                'first_name' => $request->input('first_name'),
                'last_name' => $request->input('last_name'),
                'email' => $request->input('email'),
                'phone' => $request->input('phone'),
                'status' => $request->input('status'),
            ]);
        } else {
            // Check member limits set by platform active subscription
            $tenantId = \App\Services\TenantContext::getTenantId();
            $license = \App\Models\License::where('tenant_id', $tenantId)
                ->where('status', 'active')
                ->first();

            if ($license && $license->subscriptionPlan) {
                $max = $license->subscriptionPlan->max_members;
                if ($max !== null && \App\Models\Member::count() >= $max) {
                    return response()->json(['message' => 'License limit exceeded: maximum members reached.'], 422);
                }
            }

            // Create a new member record with the client's UUID
            $member = Member::create([
                'id' => $id,
                'first_name' => $request->input('first_name'),
                'last_name' => $request->input('last_name'),
                'email' => $request->input('email'),
                'phone' => $request->input('phone'),
                'status' => $request->input('status', 'Active'),
            ]);
        }

        return response()->json($member->load('activeMemberPlan.plan'), 201);
    }
}
