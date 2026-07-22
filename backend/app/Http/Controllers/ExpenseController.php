<?php

namespace App\Http\Controllers;

use App\Models\Expense;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class ExpenseController extends Controller
{
    /**
     * GET /api/expenses
     */
    public function index()
    {
        $expenses = Expense::with('recorder')->orderBy('incurred_at', 'desc')->get();
        return response()->json($expenses);
    }

    /**
     * POST /api/expenses
     */
    public function store(Request $request)
    {
        $request->validate([
            'category' => 'required|string|in:rent,utilities,equipment,salaries,maintenance,other',
            'amount' => 'required|numeric|min:0',
            'currency' => 'nullable|string|max:3',
            'incurred_at' => 'required|date',
            'notes' => 'nullable|string',
        ]);

        $expense = Expense::create([
            'category' => $request->input('category'),
            'amount' => $request->input('amount'),
            'currency' => $request->input('currency', 'USD'),
            'incurred_at' => Carbon::parse($request->input('incurred_at')),
            'notes' => $request->input('notes'),
            'recorded_by' => $request->user()?->id,
        ]);

        return response()->json($expense->load('recorder'), 201);
    }

    /**
     * PATCH /api/expenses/{id}
     */
    public function update(Request $request, Expense $expense)
    {
        $request->validate([
            'category' => 'nullable|string|in:rent,utilities,equipment,salaries,maintenance,other',
            'amount' => 'nullable|numeric|min:0',
            'currency' => 'nullable|string|max:3',
            'incurred_at' => 'nullable|date',
            'notes' => 'nullable|string',
        ]);

        $expense->update(
            $request->only(['category', 'amount', 'currency', 'incurred_at', 'notes'])
        );

        return response()->json($expense->load('recorder'));
    }

    /**
     * DELETE /api/expenses/{id}
     */
    public function destroy(Expense $expense)
    {
        $expense->delete();
        return response()->json(['message' => 'Expense deleted successfully.']);
    }
}
