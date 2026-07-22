<?php

namespace App\Http\Controllers;

use App\Models\LeaveRequest;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class LeaveRequestController extends Controller
{
    /**
     * GET /api/leave-requests
     */
    public function index()
    {
        $requests = LeaveRequest::with('employee.user', 'approver')->orderBy('start_date', 'asc')->get();
        return response()->json($requests);
    }

    /**
     * POST /api/leave-requests
     */
    public function store(Request $request)
    {
        $request->validate([
            'employee_id' => 'required|uuid|exists:employee_profiles,id',
            'type' => 'required|string|in:sick,vacation,unpaid,other',
            'start_date' => 'required|date',
            'end_date' => 'required|date|after_or_equal:start_date',
            'reason' => 'nullable|string',
        ]);

        $leave = LeaveRequest::create([
            'employee_id' => $request->input('employee_id'),
            'type' => $request->input('type'),
            'start_date' => Carbon::parse($request->input('start_date')),
            'end_date' => Carbon::parse($request->input('end_date')),
            'reason' => $request->input('reason'),
            'status' => 'pending',
        ]);

        return response()->json($leave->load('employee.user'), 201);
    }

    /**
     * PATCH /api/leave-requests/{id}/approve
     */
    public function approve(Request $request, $id)
    {
        $leave = LeaveRequest::findOrFail($id);
        $leave->update([
            'status' => 'approved',
            'approved_by' => $request->user()?->id,
            'decided_at' => Carbon::now(),
        ]);

        return response()->json($leave->load('employee.user', 'approver'));
    }

    /**
     * PATCH /api/leave-requests/{id}/reject
     */
    public function reject(Request $request, $id)
    {
        $leave = LeaveRequest::findOrFail($id);
        $leave->update([
            'status' => 'rejected',
            'approved_by' => $request->user()?->id,
            'decided_at' => Carbon::now(),
        ]);

        return response()->json($leave->load('employee.user', 'approver'));
    }
}
