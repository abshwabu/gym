<?php

namespace App\Http\Controllers;

use App\Models\Plan;
use App\Models\MemberPlan;
use Illuminate\Http\Request;

class PlanController extends Controller
{
    /**
     * List all plans (including soft-deleted if needed, but standard is active/active only or all).
     */
    public function index()
    {
        $plans = Plan::orderBy('name')->get();
        return response()->json($plans);
    }

    /**
     * Create a new plan.
     */
    public function store(Request $request)
    {
        $request->validate([
            'name' => 'required|string|max:255',
            'billing_cycle' => 'required|string|in:one_time,weekly,monthly,quarterly,annual,custom_days',
            'custom_cycle_days' => [
                'nullable',
                'integer',
                'min:1',
                'required_if:billing_cycle,custom_days',
                function ($attribute, $value, $fail) use ($request) {
                    if ($request->input('billing_cycle') !== 'custom_days' && $value !== null) {
                        $fail('The custom cycle days must be null unless billing cycle is custom_days.');
                    }
                }
            ],
            'price' => 'required|numeric|min:0',
            'currency' => 'nullable|string|size:3',
            'session_limit' => 'nullable|integer|min:1',
            'access_hours' => 'nullable|array',
            'freeze_allowance_days' => 'nullable|integer|min:0',
            'is_active' => 'nullable|boolean',
        ]);

        $plan = Plan::create([
            'id' => $request->input('id'),
            'name' => $request->input('name'),
            'billing_cycle' => $request->input('billing_cycle'),
            'custom_cycle_days' => $request->input('custom_cycle_days'),
            'price' => $request->input('price'),
            'currency' => $request->input('currency', 'USD'),
            'session_limit' => $request->input('session_limit'),
            'access_hours' => $request->input('access_hours'),
            'freeze_allowance_days' => $request->input('freeze_allowance_days', 0),
            'is_active' => $request->input('is_active', true),
        ]);

        return response()->json($plan, 201);
    }

    /**
     * Update an existing plan.
     */
    public function update(Request $request, $id)
    {
        $plan = Plan::findOrFail($id);

        $request->validate([
            'name' => 'nullable|string|max:255',
            'billing_cycle' => 'nullable|string|in:one_time,weekly,monthly,quarterly,annual,custom_days',
            'custom_cycle_days' => [
                'nullable',
                'integer',
                'min:1',
                'required_if:billing_cycle,custom_days',
                function ($attribute, $value, $fail) use ($request, $plan) {
                    $cycle = $request->input('billing_cycle', $plan->billing_cycle);
                    if ($cycle !== 'custom_days' && $value !== null) {
                        $fail('The custom cycle days must be null unless billing cycle is custom_days.');
                    }
                }
            ],
            'price' => 'nullable|numeric|min:0',
            'currency' => 'nullable|string|size:3',
            'session_limit' => 'nullable|integer|min:1',
            'access_hours' => 'nullable|array',
            'freeze_allowance_days' => 'nullable|integer|min:0',
            'is_active' => 'nullable|boolean',
        ]);

        $plan->update($request->only([
            'name', 'billing_cycle', 'custom_cycle_days', 'price', 'currency', 'session_limit', 'access_hours', 'freeze_allowance_days', 'is_active'
        ]));

        return response()->json($plan);
    }

    /**
     * Delete a plan (soft delete; blocked if active subscriptions refer to it).
     */
    public function destroy($id)
    {
        $plan = Plan::findOrFail($id);

        // Check if any active subscriptions refer to it
        $hasActive = MemberPlan::where('plan_id', $plan->id)
            ->where('status', 'active')
            ->exists();

        if ($hasActive) {
            return response()->json([
                'message' => 'Cannot delete plan: active members are currently subscribed. You may deactivate the plan instead.'
            ], 400);
        }

        $plan->delete(); // Soft delete

        return response()->json(['success' => true]);
    }
}
