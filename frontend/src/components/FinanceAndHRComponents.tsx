import React, { useState, useEffect } from 'react';
import { 
  Plus, AlertTriangle, DollarSign, Briefcase, Trash2
} from 'lucide-react';

const apiRequest = async (path: string, method: string = 'GET', body: any = null) => {
  const token = localStorage.getItem('gym_auth_token');
  const headers: any = {
    'Accept': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (body) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  return { status: response.status, data };
};

// ==========================================
// 1. FINANCE DASHBOARD COMPONENT
// ==========================================
export const FinanceDashboard = () => {
  const [subTab, setSubTab] = useState<'invoices' | 'payments' | 'expenses' | 'reports'>('invoices');
  
  // Data lists
  const [invoices, setInvoices] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [outstanding, setOutstanding] = useState<any[]>([]);
  const [revenueReport, setRevenueReport] = useState<any[]>([]);

  // Form states
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);

  // Forms data
  const [invoiceForm, setInvoiceForm] = useState({ member_id: '', amount: '', due_at: '' });
  const [paymentForm, setPaymentForm] = useState({ member_id: '', invoice_id: '', amount: '', method: 'cash' });
  const [expenseForm, setExpenseForm] = useState({ category: 'rent', amount: '', incurred_at: '', notes: '' });
  
  // Filter for reports
  const [reportFilter, setReportFilter] = useState({
    from: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().split('T')[0],
    to: new Date().toISOString().split('T')[0],
    group_by: 'day'
  });

  // Auxiliary data
  const [members, setMembers] = useState<any[]>([]);

  const loadData = async () => {
    try {
      const resInvoices = await apiRequest('/api/invoices');
      if (resInvoices.status === 200) setInvoices(resInvoices.data || []);

      const resPayments = await apiRequest('/api/payments');
      if (resPayments.status === 200) setPayments(resPayments.data || []);

      const resExpenses = await apiRequest('/api/expenses');
      if (resExpenses.status === 200) setExpenses(resExpenses.data || []);

      const resMembers = await apiRequest('/api/members');
      if (resMembers.status === 200) setMembers(resMembers.data || []);
      
      const resOutstanding = await apiRequest('/api/finance/reports/outstanding');
      if (resOutstanding.status === 200) setOutstanding(resOutstanding.data || []);
      
      fetchRevenueReport();
    } catch (e) {
      console.error(e);
    }
  };

  const fetchRevenueReport = async () => {
    const res = await apiRequest(`/api/finance/reports/revenue?from=${reportFilter.from}&to=${reportFilter.to}&group_by=${reportFilter.group_by}`);
    if (res.status === 200) {
      setRevenueReport(res.data || []);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      ...invoiceForm,
      amount: parseFloat(invoiceForm.amount),
      issued_at: new Date().toISOString().split('T')[0]
    };
    const res = await apiRequest('/api/invoices', 'POST', payload);
    if (res.status === 201) {
      setShowInvoiceModal(false);
      setInvoiceForm({ member_id: '', amount: '', due_at: '' });
      loadData();
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      id: crypto.randomUUID(),
      member_id: paymentForm.member_id,
      invoice_id: paymentForm.invoice_id || null,
      amount: parseFloat(paymentForm.amount),
      method: paymentForm.method,
      paid_at: new Date().toISOString()
    };
    const res = await apiRequest('/api/payments', 'POST', payload);
    if (res.status === 201) {
      setShowPaymentModal(false);
      setPaymentForm({ member_id: '', invoice_id: '', amount: '', method: 'cash' });
      loadData();
    }
  };

  const handleRecordExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      ...expenseForm,
      amount: parseFloat(expenseForm.amount)
    };
    const res = await apiRequest('/api/expenses', 'POST', payload);
    if (res.status === 201) {
      setShowExpenseModal(false);
      setExpenseForm({ category: 'rent', amount: '', incurred_at: '', notes: '' });
      loadData();
    }
  };

  const handleDeleteExpense = async (id: string) => {
    if (!confirm('Are you sure you want to delete this expense?')) return;
    const res = await apiRequest(`/api/expenses/${id}`, 'DELETE');
    if (res.status === 200) {
      loadData();
    }
  };

  const totalRevenue = revenueReport.reduce((acc, curr) => acc + curr.total_amount, 0);
  const totalOutstanding = outstanding.reduce((acc, curr) => acc + parseFloat(curr.amount), 0);
  const totalExpensesSum = expenses.reduce((acc, curr) => acc + parseFloat(curr.amount), 0);

  return (
    <div style={{ animation: 'fadeIn 0.2s ease-out' }}>
      <div className="header-bar">
        <div className="header-title">
          <h1>Gym Finance Dashboard</h1>
          <p>Track membership billing, front desk sales, expenses, and periodic net revenue</p>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">
            <DollarSign size={20} />
          </div>
          <div className="stat-info">
            <div className="stat-label">Total Period Revenue</div>
            <div className="stat-value">${totalRevenue.toFixed(2)}</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ backgroundColor: 'var(--status-offline-bg)', color: 'var(--status-offline)' }}>
            <AlertTriangle size={20} />
          </div>
          <div className="stat-info">
            <div className="stat-label">Outstanding Invoices</div>
            <div className="stat-value">${totalOutstanding.toFixed(2)}</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ backgroundColor: 'var(--status-inactive-bg)', color: 'var(--status-inactive)' }}>
            <Briefcase size={20} />
          </div>
          <div className="stat-info">
            <div className="stat-label">Total Expenses</div>
            <div className="stat-value">${totalExpensesSum.toFixed(2)}</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '16px', borderBottom: '1px solid var(--border-color)', marginBottom: '24px' }}>
        <button onClick={() => setSubTab('invoices')} className={`sidebar-link ${subTab === 'invoices' ? 'active' : ''}`} style={{ border: 'none', borderBottom: subTab === 'invoices' ? '2px solid var(--accent-color)' : 'none', padding: '12px 16px', borderRadius: 0, cursor: 'pointer', width: 'auto' }}>
          Invoices Directory
        </button>
        <button onClick={() => setSubTab('payments')} className={`sidebar-link ${subTab === 'payments' ? 'active' : ''}`} style={{ border: 'none', borderBottom: subTab === 'payments' ? '2px solid var(--accent-color)' : 'none', padding: '12px 16px', borderRadius: 0, cursor: 'pointer', width: 'auto' }}>
          Payments Ledger
        </button>
        <button onClick={() => setSubTab('expenses')} className={`sidebar-link ${subTab === 'expenses' ? 'active' : ''}`} style={{ border: 'none', borderBottom: subTab === 'expenses' ? '2px solid var(--accent-color)' : 'none', padding: '12px 16px', borderRadius: 0, cursor: 'pointer', width: 'auto' }}>
          Operational Expenses
        </button>
        <button onClick={() => setSubTab('reports')} className={`sidebar-link ${subTab === 'reports' ? 'active' : ''}`} style={{ border: 'none', borderBottom: subTab === 'reports' ? '2px solid var(--accent-color)' : 'none', padding: '12px 16px', borderRadius: 0, cursor: 'pointer', width: 'auto' }}>
          Revenue Reports
        </button>
      </div>

      {/* SUBTAB 1: Invoices */}
      {subTab === 'invoices' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px', gap: '10px' }}>
            <button onClick={() => setShowInvoiceModal(true)} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Plus size={16} />
              <span>Create Invoice</span>
            </button>
            <button onClick={() => setShowPaymentModal(true)} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <DollarSign size={16} />
              <span>Record Payment</span>
            </button>
          </div>

          <div className="table-container">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Issued Date</th>
                  <th>Due Date</th>
                </tr>
              </thead>
              <tbody>
                {invoices.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                      No invoices recorded. Assign membership plans or use the action above to create one-off invoices.
                    </td>
                  </tr>
                ) : (
                  invoices.map((inv: any) => (
                    <tr key={inv.id}>
                      <td style={{ fontWeight: '600' }}>
                        {inv.member ? `${inv.member.first_name} ${inv.member.last_name}` : 'Walk-in Customer'}
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{inv.id.substring(0, 8)}...</div>
                      </td>
                      <td>${parseFloat(inv.amount).toFixed(2)}</td>
                      <td>
                        <span className={`badge badge-${inv.status === 'paid' ? 'active' : inv.status === 'partial' ? 'online' : inv.status === 'void' ? 'inactive' : 'offline'}`}>
                          {inv.status}
                        </span>
                      </td>
                      <td>{new Date(inv.issued_at).toLocaleDateString()}</td>
                      <td>{new Date(inv.due_at).toLocaleDateString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUBTAB 2: Payments Ledger */}
      {subTab === 'payments' && (
        <div className="table-container">
          <table className="custom-table">
            <thead>
              <tr>
                <th>Payment ID</th>
                <th>Member</th>
                <th>Amount</th>
                <th>Method</th>
                <th>Paid At</th>
              </tr>
            </thead>
            <tbody>
              {payments.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                    No payment transactions processed yet.
                  </td>
                </tr>
              ) : (
                payments.map((pay: any) => (
                  <tr key={pay.id}>
                    <td style={{ fontWeight: '600' }}>#{pay.id.substring(0, 8)}...</td>
                    <td>{pay.member ? `${pay.member.first_name} ${pay.member.last_name}` : 'Walk-in'}</td>
                    <td style={{ color: 'var(--status-active)' }}>${parseFloat(pay.amount).toFixed(2)}</td>
                    <td style={{ textTransform: 'capitalize' }}>{pay.method.replace('_', ' ')}</td>
                    <td>{new Date(pay.paid_at).toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* SUBTAB 3: Expenses */}
      {subTab === 'expenses' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '20px' }}>
            <button onClick={() => setShowExpenseModal(true)} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Plus size={16} />
              <span>Record Operational Expense</span>
            </button>
          </div>

          <div className="table-container">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Amount</th>
                  <th>Incurred At</th>
                  <th>Notes</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {expenses.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                      No operating expenses recorded yet.
                    </td>
                  </tr>
                ) : (
                  expenses.map((exp: any) => (
                    <tr key={exp.id}>
                      <td style={{ fontWeight: '600', textTransform: 'capitalize' }}>{exp.category}</td>
                      <td>${parseFloat(exp.amount).toFixed(2)}</td>
                      <td>{new Date(exp.incurred_at).toLocaleDateString()}</td>
                      <td style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{exp.notes || '—'}</td>
                      <td style={{ textAlign: 'right' }}>
                        <button onClick={() => handleDeleteExpense(exp.id)} className="btn btn-secondary" style={{ padding: '6px', color: 'var(--status-inactive)' }}>
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUBTAB 4: Reports */}
      {subTab === 'reports' && (
        <div>
          <div className="card" style={{ marginBottom: '24px', padding: '20px' }}>
            <h3 className="card-title" style={{ marginBottom: '12px' }}>Periodic Revenue Aggregation Filter</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'flex-end' }}>
              <div className="form-group" style={{ margin: 0, flex: '1 1 200px' }}>
                <label className="form-label">From Date</label>
                <input type="date" className="form-input" value={reportFilter.from} onChange={e => setReportFilter({ ...reportFilter, from: e.target.value })} />
              </div>
              <div className="form-group" style={{ margin: 0, flex: '1 1 200px' }}>
                <label className="form-label">To Date</label>
                <input type="date" className="form-input" value={reportFilter.to} onChange={e => setReportFilter({ ...reportFilter, to: e.target.value })} />
              </div>
              <div className="form-group" style={{ margin: 0, flex: '1 1 200px' }}>
                <label className="form-label">Group By</label>
                <select className="form-select" value={reportFilter.group_by} onChange={e => setReportFilter({ ...reportFilter, group_by: e.target.value })}>
                  <option value="day">Day</option>
                  <option value="week">Week</option>
                  <option value="month">Month</option>
                </select>
              </div>
              <button onClick={fetchRevenueReport} className="btn btn-primary" style={{ height: '40px' }}>
                Compile Reports
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', alignItems: 'start' }}>
            <div>
              <h3 className="card-title">Aggregated Revenue Summary</h3>
              <div className="table-container">
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>Period</th>
                      <th>Payments Processed</th>
                      <th>Total Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {revenueReport.length === 0 ? (
                      <tr>
                        <td colSpan={3} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                          No payments processed inside selected date range.
                        </td>
                      </tr>
                    ) : (
                      revenueReport.map((rep: any) => (
                        <tr key={rep.period}>
                          <td style={{ fontWeight: '600' }}>{rep.period}</td>
                          <td>{rep.payment_count} payments</td>
                          <td>${rep.total_amount.toFixed(2)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h3 className="card-title">Debtors list (Outstanding Invoices)</h3>
              <div className="table-container">
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>Member</th>
                      <th>Amount Owed</th>
                      <th>Due Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {outstanding.length === 0 ? (
                      <tr>
                        <td colSpan={3} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                          No outstanding invoices.
                        </td>
                      </tr>
                    ) : (
                      outstanding.map((debt: any) => (
                        <tr key={debt.id}>
                          <td style={{ fontWeight: '600' }}>
                            {debt.member ? `${debt.member.first_name} ${debt.member.last_name}` : 'Walk-in'}
                          </td>
                          <td style={{ color: 'var(--status-offline)' }}>${parseFloat(debt.amount).toFixed(2)}</td>
                          <td>{new Date(debt.due_at).toLocaleDateString()}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Invoice Creation Modal */}
      {showInvoiceModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 className="card-title">Create Manual Invoice</h3>
            <form onSubmit={handleCreateInvoice}>
              <div className="form-group">
                <label className="form-label">Target Gym Member</label>
                <select className="form-select" required value={invoiceForm.member_id} onChange={e => setInvoiceForm({ ...invoiceForm, member_id: e.target.value })}>
                  <option value="">Select Member...</option>
                  {members.map(m => (
                    <option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Billing Amount (USD)</label>
                <input type="number" step="0.01" required className="form-input" placeholder="e.g. 50.00" value={invoiceForm.amount} onChange={e => setInvoiceForm({ ...invoiceForm, amount: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Payment Due Date</label>
                <input type="date" required className="form-input" value={invoiceForm.due_at} onChange={e => setInvoiceForm({ ...invoiceForm, due_at: e.target.value })} />
              </div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
                <button type="button" onClick={() => setShowInvoiceModal(false)} className="btn btn-secondary">Cancel</button>
                <button type="submit" className="btn btn-primary">Create Invoice</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Payment Recording Modal */}
      {showPaymentModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 className="card-title">Record Member Payment</h3>
            <form onSubmit={handleRecordPayment}>
              <div className="form-group">
                <label className="form-label">Member</label>
                <select className="form-select" required value={paymentForm.member_id} onChange={e => setPaymentForm({ ...paymentForm, member_id: e.target.value })}>
                  <option value="">Select Member...</option>
                  {members.map(m => (
                    <option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Reconcile Invoice (Optional)</label>
                <select className="form-select" value={paymentForm.invoice_id} onChange={e => setPaymentForm({ ...paymentForm, invoice_id: e.target.value })}>
                  <option value="">Stand Alone / Unreconciled Payment...</option>
                  {invoices.filter(i => i.member_id === paymentForm.member_id && i.status !== 'paid').map(i => (
                    <option key={i.id} value={i.id}>Inv #{i.id.substring(0,6)} - Owed ${parseFloat(i.amount).toFixed(2)}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Payment Amount (USD)</label>
                <input type="number" step="0.01" required className="form-input" placeholder="e.g. 50.00" value={paymentForm.amount} onChange={e => setPaymentForm({ ...paymentForm, amount: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Payment Method</label>
                <select className="form-select" required value={paymentForm.method} onChange={e => setPaymentForm({ ...paymentForm, method: e.target.value })}>
                  <option value="cash">Cash</option>
                  <option value="card">Credit Card</option>
                  <option value="mobile_money">Mobile Money</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
                <button type="button" onClick={() => setShowPaymentModal(false)} className="btn btn-secondary">Cancel</button>
                <button type="submit" className="btn btn-primary">Process Payment</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Expense Modal */}
      {showExpenseModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 className="card-title">Record Operating Expense</h3>
            <form onSubmit={handleRecordExpense}>
              <div className="form-group">
                <label className="form-label">Expense Category</label>
                <select className="form-select" required value={expenseForm.category} onChange={e => setExpenseForm({ ...expenseForm, category: e.target.value })}>
                  <option value="rent">Rent</option>
                  <option value="utilities">Utilities</option>
                  <option value="equipment">Equipment & Maintenance</option>
                  <option value="salaries">Salaries & Wages</option>
                  <option value="maintenance">Maintenance</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Amount (USD)</label>
                <input type="number" step="0.01" required className="form-input" placeholder="e.g. 1500.00" value={expenseForm.amount} onChange={e => setExpenseForm({ ...expenseForm, amount: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Incurred Date</label>
                <input type="date" required className="form-input" value={expenseForm.incurred_at} onChange={e => setExpenseForm({ ...expenseForm, incurred_at: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Notes / Description</label>
                <textarea className="form-input" placeholder="Wages detail, utility bill number..." value={expenseForm.notes} onChange={e => setExpenseForm({ ...expenseForm, notes: e.target.value })} />
              </div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
                <button type="button" onClick={() => setShowExpenseModal(false)} className="btn btn-secondary">Cancel</button>
                <button type="submit" className="btn btn-primary">Record Expense</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// ==========================================
// 2. HR MANAGEMENT DASHBOARD COMPONENT
// ==========================================
export const HRDashboard = () => {
  const [subTab, setSubTab] = useState<'employees' | 'shifts' | 'leaves' | 'payroll'>('employees');
  
  // Data list states
  const [employees, setEmployees] = useState<any[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);
  const [leaves, setLeaves] = useState<any[]>([]);
  const [payrollRuns, setPayrollRuns] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);

  // Modal displays
  const [showEmployeeModal, setShowEmployeeModal] = useState(false);
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [showPayrollModal, setShowPayrollModal] = useState(false);

  // Forms
  const [employeeForm, setEmployeeForm] = useState({ user_id: '', employee_code: '', hire_date: '', employment_type: 'full_time', salary_amount: '', salary_cycle: 'monthly' });
  const [shiftForm, setShiftForm] = useState({ employee_id: '', shift_date: '', start_time: '09:00:00', end_time: '17:00:00' });
  const [leaveForm, setLeaveForm] = useState({ employee_id: '', type: 'vacation', start_date: '', end_date: '', reason: '' });
  const [payrollForm, setPayrollForm] = useState({ period_start: '', period_end: '' });

  const loadData = async () => {
    try {
      const resEmp = await apiRequest('/api/employees');
      if (resEmp.status === 200) setEmployees(resEmp.data || []);

      const resShifts = await apiRequest('/api/shifts');
      if (resShifts.status === 200) setShifts(resShifts.data || []);

      const resLeaves = await apiRequest('/api/leave-requests');
      if (resLeaves.status === 200) setLeaves(resLeaves.data || []);

      const resRuns = await apiRequest('/api/payroll-runs');
      if (resRuns.status === 200) setPayrollRuns(resRuns.data || []);

      // Get users (to link profiles)
      const resUsers = await apiRequest('/api/staff');
      if (resUsers.status === 200) setUsers(resUsers.data || []);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      ...employeeForm,
      salary_amount: parseFloat(employeeForm.salary_amount)
    };
    const res = await apiRequest('/api/employees', 'POST', payload);
    if (res.status === 201) {
      setShowEmployeeModal(false);
      setEmployeeForm({ user_id: '', employee_code: '', hire_date: '', employment_type: 'full_time', salary_amount: '', salary_cycle: 'monthly' });
      loadData();
    }
  };

  const handleCreateShift = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await apiRequest('/api/shifts', 'POST', shiftForm);
    if (res.status === 201) {
      setShowShiftModal(false);
      setShiftForm({ employee_id: '', shift_date: '', start_time: '09:00:00', end_time: '17:00:00' });
      loadData();
    }
  };

  const handleDeleteShift = async (id: string) => {
    if (!confirm('Are you sure you want to delete this shift?')) return;
    const res = await apiRequest(`/api/shifts/${id}`, 'DELETE');
    if (res.status === 200) {
      loadData();
    }
  };

  const handleCreateLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await apiRequest('/api/leave-requests', 'POST', leaveForm);
    if (res.status === 201) {
      setShowLeaveModal(false);
      setLeaveForm({ employee_id: '', type: 'vacation', start_date: '', end_date: '', reason: '' });
      loadData();
    }
  };

  const handleLeaveDecision = async (id: string, action: 'approve' | 'reject') => {
    const res = await apiRequest(`/api/leave-requests/${id}/${action}`, 'PATCH');
    if (res.status === 200) {
      loadData();
    }
  };

  const handleCreatePayroll = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await apiRequest('/api/payroll-runs', 'POST', payrollForm);
    if (res.status === 201) {
      setShowPayrollModal(false);
      setPayrollForm({ period_start: '', period_end: '' });
      loadData();
    }
  };

  return (
    <div style={{ animation: 'fadeIn 0.2s ease-out' }}>
      <div className="header-bar">
        <div className="header-title">
          <h1>Gym HR & Staff Management</h1>
          <p>Register employees, manage work shifts, process clock records, and handle leave/payroll schedules</p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '16px', borderBottom: '1px solid var(--border-color)', marginBottom: '24px' }}>
        <button onClick={() => setSubTab('employees')} className={`sidebar-link ${subTab === 'employees' ? 'active' : ''}`} style={{ border: 'none', borderBottom: subTab === 'employees' ? '2px solid var(--accent-color)' : 'none', padding: '12px 16px', borderRadius: 0, cursor: 'pointer', width: 'auto' }}>
          Employees Profiles
        </button>
        <button onClick={() => setSubTab('shifts')} className={`sidebar-link ${subTab === 'shifts' ? 'active' : ''}`} style={{ border: 'none', borderBottom: subTab === 'shifts' ? '2px solid var(--accent-color)' : 'none', padding: '12px 16px', borderRadius: 0, cursor: 'pointer', width: 'auto' }}>
          Shift Schedules
        </button>
        <button onClick={() => setSubTab('leaves')} className={`sidebar-link ${subTab === 'leaves' ? 'active' : ''}`} style={{ border: 'none', borderBottom: subTab === 'leaves' ? '2px solid var(--accent-color)' : 'none', padding: '12px 16px', borderRadius: 0, cursor: 'pointer', width: 'auto' }}>
          Leave Approval Requests
        </button>
        <button onClick={() => setSubTab('payroll')} className={`sidebar-link ${subTab === 'payroll' ? 'active' : ''}`} style={{ border: 'none', borderBottom: subTab === 'payroll' ? '2px solid var(--accent-color)' : 'none', padding: '12px 16px', borderRadius: 0, cursor: 'pointer', width: 'auto' }}>
          Payroll Operations
        </button>
      </div>

      {/* SUBTAB 1: Employees Profiles */}
      {subTab === 'employees' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '20px' }}>
            <button onClick={() => setShowEmployeeModal(true)} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Plus size={16} />
              <span>Link User to HR Profile</span>
            </button>
          </div>

          <div className="table-container">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Employee Code</th>
                  <th>Full Name</th>
                  <th>Type</th>
                  <th>Salary Rate</th>
                  <th>Hire Date</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {employees.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                      No employee profiles created yet. Link invited staff members using the action button.
                    </td>
                  </tr>
                ) : (
                  employees.map((emp: any) => (
                    <tr key={emp.id}>
                      <td style={{ fontWeight: '600' }}>{emp.employee_code}</td>
                      <td>{emp.user ? emp.user.name : 'Unknown User'}</td>
                      <td style={{ textTransform: 'capitalize' }}>{emp.employment_type.replace('_', ' ')}</td>
                      <td>
                        ${parseFloat(emp.salary_amount).toFixed(2)} / {emp.salary_cycle}
                      </td>
                      <td>{new Date(emp.hire_date).toLocaleDateString()}</td>
                      <td>
                        <span className={`badge badge-${emp.status === 'active' ? 'active' : emp.status === 'on_leave' ? 'online' : 'inactive'}`}>
                          {emp.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUBTAB 2: Shift Schedules */}
      {subTab === 'shifts' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '20px' }}>
            <button onClick={() => setShowShiftModal(true)} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Plus size={16} />
              <span>Add Shift Schedule</span>
            </button>
          </div>

          <div className="table-container">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Staff Member</th>
                  <th>Shift Date</th>
                  <th>Start Time</th>
                  <th>End Time</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {shifts.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                      No shifts scheduled.
                    </td>
                  </tr>
                ) : (
                  shifts.map((s: any) => (
                    <tr key={s.id}>
                      <td style={{ fontWeight: '600' }}>{s.employee && s.employee.user ? s.employee.user.name : 'Unknown'}</td>
                      <td>{new Date(s.shift_date).toLocaleDateString()}</td>
                      <td>{s.start_time}</td>
                      <td>{s.end_time}</td>
                      <td style={{ textAlign: 'right' }}>
                        <button onClick={() => handleDeleteShift(s.id)} className="btn btn-secondary" style={{ padding: '6px', color: 'var(--status-inactive)' }}>
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUBTAB 3: Leaves */}
      {subTab === 'leaves' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '20px' }}>
            <button onClick={() => setShowLeaveModal(true)} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Plus size={16} />
              <span>Submit Leave Request</span>
            </button>
          </div>

          <div className="table-container">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Type</th>
                  <th>Start Date</th>
                  <th>End Date</th>
                  <th>Reason</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {leaves.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                      No leave requests submitted.
                    </td>
                  </tr>
                ) : (
                  leaves.map((l: any) => (
                    <tr key={l.id}>
                      <td style={{ fontWeight: '600' }}>{l.employee && l.employee.user ? l.employee.user.name : 'Unknown'}</td>
                      <td style={{ textTransform: 'capitalize' }}>{l.type}</td>
                      <td>{new Date(l.start_date).toLocaleDateString()}</td>
                      <td>{new Date(l.end_date).toLocaleDateString()}</td>
                      <td style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{l.reason || '—'}</td>
                      <td>
                        <span className={`badge badge-${l.status === 'approved' ? 'active' : l.status === 'pending' ? 'online' : 'inactive'}`}>
                          {l.status}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {l.status === 'pending' && (
                          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button onClick={() => handleLeaveDecision(l.id, 'approve')} className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '12px', color: 'var(--status-active)' }}>Approve</button>
                            <button onClick={() => handleLeaveDecision(l.id, 'reject')} className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '12px', color: 'var(--status-inactive)' }}>Reject</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUBTAB 4: Payroll Runs */}
      {subTab === 'payroll' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '20px' }}>
            <button onClick={() => setShowPayrollModal(true)} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Plus size={16} />
              <span>Generate Payroll Run</span>
            </button>
          </div>

          <div className="table-container">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Period</th>
                  <th>Generated At</th>
                  <th>Status</th>
                  <th>Line Items / Total Net Pay</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {payrollRuns.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                      No payroll runs generated. Choose a period above to calculate base salaries and approved unpaid leave deductions.
                    </td>
                  </tr>
                ) : (
                  payrollRuns.map((p: any) => (
                    <tr key={p.id}>
                      <td style={{ fontWeight: '600' }}>
                        {new Date(p.period_start).toLocaleDateString()} to {new Date(p.period_end).toLocaleDateString()}
                      </td>
                      <td>{new Date(p.generated_at).toLocaleString()}</td>
                      <td>
                        <span className={`badge badge-${p.status === 'finalized' ? 'active' : p.status === 'draft' ? 'online' : 'inactive'}`}>
                          {p.status}
                        </span>
                      </td>
                      <td>
                        {p.line_items ? `${p.line_items.length} employees` : '—'}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {p.status === 'draft' && (
                          <button onClick={async () => {
                            const res = await apiRequest(`/api/payroll-runs/${p.id}/finalize`, 'PATCH');
                            if (res.status === 200) {
                              loadData();
                            }
                          }} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px', color: 'var(--status-active)' }}>
                            Finalize Period
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Employee Modal */}
      {showEmployeeModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 className="card-title">Link User to HR Profile</h3>
            <form onSubmit={handleCreateEmployee}>
              <div className="form-group">
                <label className="form-label">Gym User Account</label>
                <select className="form-select" required value={employeeForm.user_id} onChange={e => setEmployeeForm({ ...employeeForm, user_id: e.target.value })}>
                  <option value="">Select User...</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Employee Code</label>
                <input type="text" required className="form-input" placeholder="e.g. EMP-101" value={employeeForm.employee_code} onChange={e => setEmployeeForm({ ...employeeForm, employee_code: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Hire Date</label>
                <input type="date" required className="form-input" value={employeeForm.hire_date} onChange={e => setEmployeeForm({ ...employeeForm, hire_date: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Employment Type</label>
                <select className="form-select" required value={employeeForm.employment_type} onChange={e => setEmployeeForm({ ...employeeForm, employment_type: e.target.value })}>
                  <option value="full_time">Full Time</option>
                  <option value="part_time">Part Time</option>
                  <option value="contract">Contract</option>
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div className="form-group">
                  <label className="form-label">Salary / Rate (USD)</label>
                  <input type="number" step="0.01" required className="form-input" placeholder="e.g. 3000.00" value={employeeForm.salary_amount} onChange={e => setEmployeeForm({ ...employeeForm, salary_amount: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Salary Cycle</label>
                  <select className="form-select" required value={employeeForm.salary_cycle} onChange={e => setEmployeeForm({ ...employeeForm, salary_cycle: e.target.value })}>
                    <option value="monthly">Monthly</option>
                    <option value="hourly">Hourly</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
                <button type="button" onClick={() => setShowEmployeeModal(false)} className="btn btn-secondary">Cancel</button>
                <button type="submit" className="btn btn-primary">Create Profile</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Shift Modal */}
      {showShiftModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 className="card-title">Schedule Employee Shift</h3>
            <form onSubmit={handleCreateShift}>
              <div className="form-group">
                <label className="form-label">Staff Member</label>
                <select className="form-select" required value={shiftForm.employee_id} onChange={e => setShiftForm({ ...shiftForm, employee_id: e.target.value })}>
                  <option value="">Select Staff...</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.user ? emp.user.name : 'Staff member'} ({emp.employee_code})</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Shift Date</label>
                <input type="date" required className="form-input" value={shiftForm.shift_date} onChange={e => setShiftForm({ ...shiftForm, shift_date: e.target.value })} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div className="form-group">
                  <label className="form-label">Start Time</label>
                  <input type="text" required className="form-input" placeholder="09:00:00" value={shiftForm.start_time} onChange={e => setShiftForm({ ...shiftForm, start_time: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">End Time</label>
                  <input type="text" required className="form-input" placeholder="17:00:00" value={shiftForm.end_time} onChange={e => setShiftForm({ ...shiftForm, end_time: e.target.value })} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
                <button type="button" onClick={() => setShowShiftModal(false)} className="btn btn-secondary">Cancel</button>
                <button type="submit" className="btn btn-primary">Schedule Shift</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Leave Modal */}
      {showLeaveModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 className="card-title">Apply for Staff Leave</h3>
            <form onSubmit={handleCreateLeave}>
              <div className="form-group">
                <label className="form-label">Staff Member</label>
                <select className="form-select" required value={leaveForm.employee_id} onChange={e => setLeaveForm({ ...leaveForm, employee_id: e.target.value })}>
                  <option value="">Select Staff...</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.user ? emp.user.name : 'Staff member'} ({emp.employee_code})</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Leave Type</label>
                <select className="form-select" required value={leaveForm.type} onChange={e => setLeaveForm({ ...leaveForm, type: e.target.value })}>
                  <option value="sick">Sick Leave</option>
                  <option value="vacation">Vacation</option>
                  <option value="unpaid">Unpaid Leave</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div className="form-group">
                  <label className="form-label">Start Date</label>
                  <input type="date" required className="form-input" value={leaveForm.start_date} onChange={e => setLeaveForm({ ...leaveForm, start_date: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">End Date</label>
                  <input type="date" required className="form-input" value={leaveForm.end_date} onChange={e => setLeaveForm({ ...leaveForm, end_date: e.target.value })} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Reason / Detail</label>
                <textarea className="form-input" placeholder="Medical reason, holiday trip..." value={leaveForm.reason} onChange={e => setLeaveForm({ ...leaveForm, reason: e.target.value })} />
              </div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
                <button type="button" onClick={() => setShowLeaveModal(false)} className="btn btn-secondary">Cancel</button>
                <button type="submit" className="btn btn-primary">Apply Leave</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Payroll Modal */}
      {showPayrollModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 className="card-title">Generate Payroll Run</h3>
            <form onSubmit={handleCreatePayroll}>
              <div className="form-group">
                <label className="form-label">Period Start Date</label>
                <input type="date" required className="form-input" value={payrollForm.period_start} onChange={e => setPayrollForm({ ...payrollForm, period_start: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Period End Date</label>
                <input type="date" required className="form-input" value={payrollForm.period_end} onChange={e => setPayrollForm({ ...payrollForm, period_end: e.target.value })} />
              </div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
                <button type="button" onClick={() => setShowPayrollModal(false)} className="btn btn-secondary">Cancel</button>
                <button type="submit" className="btn btn-primary">Process Payroll</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
