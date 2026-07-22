<?php

namespace App\Http\Controllers;

use App\Models\StaffShift;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class StaffShiftController extends Controller
{
    /**
     * GET /api/shifts
     */
    public function index()
    {
        $shifts = StaffShift::with('employee.user')->orderBy('shift_date', 'asc')->get();
        return response()->json($shifts);
    }

    /**
     * POST /api/shifts
     */
    public function store(Request $request)
    {
        $request->validate([
            'employee_id' => 'required|uuid|exists:employee_profiles,id',
            'shift_date' => 'required|date',
            'start_time' => 'required|string',
            'end_time' => 'required|string',
        ]);

        $shift = StaffShift::create([
            'employee_id' => $request->input('employee_id'),
            'shift_date' => Carbon::parse($request->input('shift_date')),
            'start_time' => $request->input('start_time'),
            'end_time' => $request->input('end_time'),
        ]);

        return response()->json($shift->load('employee.user'), 201);
    }

    /**
     * PATCH /api/shifts/{id}
     */
    public function update(Request $request, StaffShift $shift)
    {
        $request->validate([
            'shift_date' => 'nullable|date',
            'start_time' => 'nullable|string',
            'end_time' => 'nullable|string',
        ]);

        $shift->update(
            $request->only(['shift_date', 'start_time', 'end_time'])
        );

        return response()->json($shift->load('employee.user'));
    }

    /**
     * DELETE /api/shifts/{id}
     */
    public function destroy(StaffShift $shift)
    {
        $shift->delete();
        return response()->json(['message' => 'Shift deleted successfully.']);
    }
}
