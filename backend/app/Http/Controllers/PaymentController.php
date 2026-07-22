<?php

namespace App\Http\Controllers;

use App\Models\Payment;
use App\Models\Invoice;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class PaymentController extends Controller
{
    /**
     * POST /api/payments
     */
    public function store(Request $request)
    {
        $request->validate([
            'id' => 'required|uuid',
            'member_id' => 'required|uuid|exists:members,id',
            'invoice_id' => 'nullable|uuid|exists:invoices,id',
            'amount' => 'required|numeric|min:0',
            'currency' => 'nullable|string|max:3',
            'method' => 'required|string|in:cash,card,mobile_money,bank_transfer,other',
            'paid_at' => 'required|date',
        ]);

        $payment = $this->recordPayment($request->all(), $request->user()?->id);

        return response()->json($payment, 201);
    }

    /**
     * POST /api/payments/bulk
     */
    public function bulk(Request $request)
    {
        $request->validate([
            'payments' => 'required|array',
            'payments.*.id' => 'required|uuid',
            'payments.*.member_id' => 'required|uuid|exists:members,id',
            'payments.*.invoice_id' => 'nullable|uuid|exists:invoices,id',
            'payments.*.amount' => 'required|numeric|min:0',
            'payments.*.currency' => 'nullable|string|max:3',
            'payments.*.method' => 'required|string|in:cash,card,mobile_money,bank_transfer,other',
            'payments.*.paid_at' => 'required|date',
        ]);

        $results = [];
        $userId = $request->user()?->id;

        foreach ($request->input('payments') as $payData) {
            $results[] = $this->recordPayment($payData, $userId);
        }

        return response()->json([
            'message' => 'Bulk payments processed successfully.',
            'results' => $results,
        ], 200);
    }

    /**
     * Helper to process payment logic.
     */
    private function recordPayment(array $data, $recordedByUserId)
    {
        $id = $data['id'];
        $payment = Payment::find($id);

        if ($payment) {
            return $payment; // Idempotent return
        }

        $payment = Payment::create([
            'id' => $id,
            'invoice_id' => $data['invoice_id'] ?? null,
            'member_id' => $data['member_id'],
            'amount' => $data['amount'],
            'currency' => $data['currency'] ?? 'USD',
            'method' => $data['method'] ?? 'cash',
            'paid_at' => Carbon::parse($data['paid_at']),
            'recorded_by' => $recordedByUserId,
        ]);

        // Reconcile Invoice
        if ($payment->invoice_id) {
            $invoice = Invoice::find($payment->invoice_id);
            if ($invoice && $invoice->status !== 'void') {
                $totalPaid = Payment::where('invoice_id', $invoice->id)->sum('amount');
                if ($totalPaid >= $invoice->amount) {
                    $invoice->update(['status' => 'paid']);
                } else if ($totalPaid > 0) {
                    $invoice->update(['status' => 'partial']);
                }
            }
        }

        return $payment;
    }
}
