<?php

namespace App\Http\Controllers;

use App\Models\EmployeeProfile;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class EmployeeController extends Controller
{
    /**
     * GET /api/employees
     */
    public function index()
    {
        $employees = EmployeeProfile::with('user')->get();
        return response()->json($employees);
    }

    /**
     * POST /api/employees
     */
    public function store(Request $request)
    {
        $request->validate([
            'user_id' => 'required|uuid|exists:users,id|unique:employee_profiles,user_id',
            'employee_code' => 'required|string|max:100',
            'hire_date' => 'required|date',
            'employment_type' => 'required|string|in:full_time,part_time,contract',
            'salary_amount' => 'required|numeric|min:0',
            'salary_currency' => 'nullable|string|max:3',
            'salary_cycle' => 'required|string|in:monthly,hourly',
            'status' => 'nullable|string|in:active,on_leave,terminated',
        ]);

        // Assert employee_code uniqueness within tenant
        $existsCode = EmployeeProfile::where('employee_code', $request->input('employee_code'))->exists();
        if ($existsCode) {
            return response()->json(['message' => 'Employee code is already in use.'], 422);
        }

        $employee = EmployeeProfile::create([
            'user_id' => $request->input('user_id'),
            'employee_code' => $request->input('employee_code'),
            'hire_date' => $request->input('hire_date'),
            'employment_type' => $request->input('employment_type'),
            'salary_amount' => $request->input('salary_amount'),
            'salary_currency' => $request->input('salary_currency', 'USD'),
            'salary_cycle' => $request->input('salary_cycle'),
            'status' => $request->input('status', 'active'),
        ]);

        return response()->json($employee->load('user'), 201);
    }

    /**
     * PATCH /api/employees/{id}
     */
    public function update(Request $request, EmployeeProfile $employee)
    {
        $request->validate([
            'employee_code' => [
                'nullable', 'string', 'max:100',
                Rule::unique('employee_profiles', 'employee_code')
                    ->where('tenant_id', $employee->tenant_id)
                    ->ignore($employee->id)
            ],
            'hire_date' => 'nullable|date',
            'employment_type' => 'nullable|string|in:full_time,part_time,contract',
            'salary_amount' => 'nullable|numeric|min:0',
            'salary_currency' => 'nullable|string|max:3',
            'salary_cycle' => 'nullable|string|in:monthly,hourly',
            'status' => 'nullable|string|in:active,on_leave,terminated',
        ]);

        $employee->update(
            $request->only(['employee_code', 'hire_date', 'employment_type', 'salary_amount', 'salary_currency', 'salary_cycle', 'status'])
        );

        return response()->json($employee->load('user'));
    }
}
