<?php

namespace App\Http\Controllers;

use App\Models\StaffAttendance;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class StaffAttendanceController extends Controller
{
    /**
     * POST /api/staff-attendance/clock-in
     */
    public function clockIn(Request $request)
    {
        $request->validate([
            'id' => 'required|uuid',
            'employee_id' => 'required|uuid|exists:employee_profiles,id',
            'clock_in_at' => 'required|date',
            'method' => 'required|string|in:manual,kiosk',
        ]);

        $id = $request->input('id');
        $attendance = StaffAttendance::find($id);

        if ($attendance) {
            return response()->json($attendance, 201); // Idempotent retry
        }

        $attendance = StaffAttendance::create([
            'id' => $id,
            'employee_id' => $request->input('employee_id'),
            'clock_in_at' => Carbon::parse($request->input('clock_in_at')),
            'method' => $request->input('method'),
        ]);

        return response()->json($attendance, 201);
    }

    /**
     * POST /api/staff-attendance/clock-out
     */
    public function clockOut(Request $request)
    {
        $request->validate([
            'id' => 'required|uuid|exists:staff_attendance,id',
            'clock_out_at' => 'required|date',
        ]);

        $attendance = StaffAttendance::findOrFail($request->input('id'));
        $attendance->update([
            'clock_out_at' => Carbon::parse($request->input('clock_out_at')),
        ]);

        return response()->json($attendance);
    }

    /**
     * POST /api/staff-attendance/bulk
     */
    public function bulk(Request $request)
    {
        $request->validate([
            'attendances' => 'required|array',
            'attendances.*.id' => 'required|uuid',
            'attendances.*.employee_id' => 'required|uuid|exists:employee_profiles,id',
            'attendances.*.clock_in_at' => 'required|date',
            'attendances.*.clock_out_at' => 'nullable|date',
            'attendances.*.method' => 'required|string|in:manual,kiosk',
        ]);

        $results = [];
        foreach ($request->input('attendances') as $attData) {
            $id = $attData['id'];
            $attendance = StaffAttendance::find($id);

            if (!$attendance) {
                $attendance = StaffAttendance::create([
                    'id' => $id,
                    'employee_id' => $attData['employee_id'],
                    'clock_in_at' => Carbon::parse($attData['clock_in_at']),
                    'clock_out_at' => isset($attData['clock_out_at']) ? Carbon::parse($attData['clock_out_at']) : null,
                    'method' => $attData['method'],
                ]);
            } else {
                if (isset($attData['clock_out_at'])) {
                    $attendance->update([
                        'clock_out_at' => Carbon::parse($attData['clock_out_at']),
                    ]);
                }
            }

            $results[] = $attendance;
        }

        return response()->json([
            'message' => 'Bulk staff attendances synced.',
            'results' => $results,
        ]);
    }
}
