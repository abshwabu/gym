<?php

namespace App\Http\Controllers;

use App\Models\EmployeeProfile;
use Illuminate\Database\QueryException;
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
            'hire_date' => 'required|date',
            'employment_type' => 'required|string|in:full_time,part_time,contract',
            'salary_amount' => 'required|numeric|min:0',
            'salary_currency' => 'nullable|string|max:3',
            'salary_cycle' => 'required|string|in:monthly,hourly',
            'status' => 'nullable|string|in:active,on_leave,terminated',
        ]);

        $attributes = [
            'user_id' => $request->input('user_id'),
            'hire_date' => $request->input('hire_date'),
            'employment_type' => $request->input('employment_type'),
            'salary_amount' => $request->input('salary_amount'),
            'salary_currency' => $request->input('salary_currency', 'USD'),
            'salary_cycle' => $request->input('salary_cycle'),
            'status' => $request->input('status', 'active'),
        ];

        // Always generate server-side; ignore any client-provided employee_code.
        $employee = $this->createWithUniqueEmployeeCode($attributes);

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

    /**
     * Create an employee profile, retrying on rare employee_code collisions.
     */
    private function createWithUniqueEmployeeCode(array $attributes): EmployeeProfile
    {
        $attempts = 0;

        while ($attempts < 5) {
            $attempts++;
            $attributes['employee_code'] = EmployeeProfile::generateEmployeeCode();

            try {
                return EmployeeProfile::create($attributes);
            } catch (QueryException $e) {
                if (! $this->isUniqueConstraintViolation($e) || $attempts >= 5) {
                    throw $e;
                }
            }
        }

        throw new \RuntimeException('Unable to generate a unique employee code.');
    }

    private function isUniqueConstraintViolation(QueryException $e): bool
    {
        // SQLSTATE 23000 = integrity constraint violation (MySQL/SQLite/Postgres variants)
        return $e->errorInfo[0] === '23000'
            || str_contains(strtolower($e->getMessage()), 'unique')
            || str_contains(strtolower($e->getMessage()), 'duplicate');
    }
}
