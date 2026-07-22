<?php

namespace App\Http\Controllers;

use App\Models\Attendance;
use Illuminate\Http\Request;

class AttendanceController extends Controller
{
    /**
     * List all attendance logs.
     */
    public function index()
    {
        $attendance = Attendance::with('member.plan')->orderBy('checked_in_at', 'desc')->get();
        return response()->json($attendance);
    }

    /**
     * Mark member attendance (Idempotent creation for append-only log).
     */
    public function store(Request $request)
    {
        $request->validate([
            'id' => 'required|uuid',
            'member_id' => 'required|uuid|exists:members,id',
            'checked_in_at' => 'required|date',
        ]);

        $id = $request->input('id');
        $attendance = Attendance::find($id);

        if ($attendance) {
            // Record already exists. Just return it to satisfy client-side retries (Idempotency).
            return response()->json($attendance->load('member.plan'), 200);
        }

        $attendance = Attendance::create([
            'id' => $id,
            'member_id' => $request->input('member_id'),
            'checked_in_at' => $request->input('checked_in_at'),
        ]);

        return response()->json($attendance->load('member.plan'), 201);
    }
}
