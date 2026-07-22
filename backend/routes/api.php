<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

use App\Http\Controllers\AuthController;
use App\Http\Controllers\MemberController;
use App\Http\Controllers\PlanController;
use App\Http\Controllers\MemberPlanController;
use App\Http\Controllers\AttendanceController;
use App\Http\Controllers\SyncController;
use App\Http\Controllers\InvitationController;
use App\Http\Controllers\RoleController;
use App\Http\Controllers\PlatformController;
use App\Http\Controllers\LicenseController;
use App\Http\Controllers\InvoiceController;
use App\Http\Controllers\PaymentController;
use App\Http\Controllers\ExpenseController;
use App\Http\Controllers\FinanceReportController;
use App\Http\Controllers\EmployeeController;
use App\Http\Controllers\StaffShiftController;
use App\Http\Controllers\StaffAttendanceController;
use App\Http\Controllers\LeaveRequestController;
use App\Http\Controllers\PayrollController;

// Unauthenticated routes
Route::post('/login', [AuthController::class, 'login']);
Route::post('/staff/activate/{user}', [InvitationController::class, 'activate'])
    ->name('invitation.activate')
    ->middleware('signed');

// Platform-level Super Admin endpoints
Route::middleware(['auth:sanctum', 'super_admin'])->prefix('platform')->group(function () {
    Route::get('/tenants', [PlatformController::class, 'index']);
    Route::post('/tenants', [PlatformController::class, 'store']);
    Route::patch('/tenants/{id}/suspend', [PlatformController::class, 'suspend']);
    Route::patch('/tenants/{id}/activate', [PlatformController::class, 'activate']);
    Route::post('/tenants/{id}/reset-owner-password', [PlatformController::class, 'resetOwnerPassword']);

    // Platform Subscription Plans CRUD
    Route::get('/subscription-plans', [PlatformController::class, 'plansIndex']);
    Route::post('/subscription-plans', [PlatformController::class, 'plansStore']);
    Route::patch('/subscription-plans/{id}', [PlatformController::class, 'plansUpdate']);
    Route::delete('/subscription-plans/{id}', [PlatformController::class, 'plansDestroy']);

    // Platform Licenses Management
    Route::get('/tenants/{id}/licenses', [PlatformController::class, 'tenantLicenses']);
    Route::post('/tenants/{id}/licenses', [PlatformController::class, 'issueLicense']);
    Route::patch('/licenses/{licenseId}/extend', [PlatformController::class, 'extendLicense']);
    Route::patch('/licenses/{licenseId}/revoke', [PlatformController::class, 'revokeLicense']);

    // Impersonation
    Route::post('/tenants/{id}/impersonate', [PlatformController::class, 'impersonate']);
    Route::post('/impersonate/end', [PlatformController::class, 'endImpersonate']);
    Route::get('/impersonation-logs', [PlatformController::class, 'impersonationLogs']);
});

// Authenticated, tenant-scoped routes
Route::middleware(['auth:sanctum', 'tenant'])->group(function () {
    Route::get('/auth/me', [AuthController::class, 'me']);
    Route::post('/logout', [AuthController::class, 'logout']);

    // Client license token refresh
    Route::post('/license/refresh', [LicenseController::class, 'refresh']);
    Route::post('/license/activate', [LicenseController::class, 'activate']);

    // Staff invitations & management
    Route::get('/staff', [InvitationController::class, 'index'])->middleware('privilege:staff.view');
    Route::post('/staff/invite', [InvitationController::class, 'invite'])->middleware('privilege:staff.invite');
    Route::post('/staff/{user}/resend', [InvitationController::class, 'resend'])->middleware('privilege:staff.invite');
    Route::delete('/staff/{user}/revoke', [InvitationController::class, 'revoke'])->middleware('privilege:staff.invite');
    Route::patch('/staff/{user}/toggle', [InvitationController::class, 'toggle'])->middleware('privilege:staff.invite');

    // Roles CRUD
    Route::get('/roles', [RoleController::class, 'index'])->middleware('privilege:roles.view');
    Route::post('/roles', [RoleController::class, 'store'])->middleware('privilege:roles.create');
    Route::patch('/roles/{id}', [RoleController::class, 'update'])->middleware('privilege:roles.edit');
    Route::delete('/roles/{id}', [RoleController::class, 'destroy'])->middleware('privilege:roles.delete');
    Route::post('/roles/{id}/privileges', [RoleController::class, 'syncPrivileges'])->middleware('privilege:roles.edit');

    // Members
    Route::get('/members', [MemberController::class, 'index'])->middleware('privilege:members.view');
    Route::post('/members', [MemberController::class, 'store'])->middleware('privilege:members.create');

    // Member Plans (Subscriptions)
    Route::get('/members/{member}/plans', [MemberPlanController::class, 'index'])->middleware('privilege:members.view');
    Route::post('/members/{member}/plans', [MemberPlanController::class, 'store'])->middleware('privilege:members.update');
    Route::post('/member-plans/{id}/freeze', [MemberPlanController::class, 'freeze'])->middleware('privilege:members.update');
    Route::post('/member-plans/{id}/unfreeze', [MemberPlanController::class, 'unfreeze'])->middleware('privilege:members.update');

    // Plans CRUD
    Route::get('/plans', [PlanController::class, 'index'])->middleware('privilege:plans.view');
    Route::post('/plans', [PlanController::class, 'store'])->middleware('privilege:plans.create');
    Route::patch('/plans/{id}', [PlanController::class, 'update'])->middleware('privilege:plans.update');
    Route::delete('/plans/{id}', [PlanController::class, 'destroy'])->middleware('privilege:plans.delete');

    // Attendance
    Route::get('/attendances', [AttendanceController::class, 'index'])->middleware('privilege:attendance.view');
    Route::post('/attendances', [AttendanceController::class, 'store'])->middleware('privilege:attendance.mark');
    Route::post('/attendances/bulk', [AttendanceController::class, 'bulk'])->middleware('privilege:attendance.mark');
    Route::get('/members/{member}/attendance-summary', [AttendanceController::class, 'summary'])->middleware('privilege:attendance.view');

    // Offline Batch Sync
    Route::post('/sync', [SyncController::class, 'sync']);
    Route::get('/sync/changes', [SyncController::class, 'changes']);

    // Finance Invoices
    Route::get('/invoices', [InvoiceController::class, 'index'])->middleware('privilege:finance.view');
    Route::post('/invoices', [InvoiceController::class, 'store'])->middleware('privilege:finance.invoices.manage');
    Route::patch('/invoices/{invoice}', [InvoiceController::class, 'update'])->middleware('privilege:finance.invoices.manage');

    // Finance Payments
    Route::post('/payments', [PaymentController::class, 'store'])->middleware('privilege:finance.payments.record');
    Route::post('/payments/bulk', [PaymentController::class, 'bulk'])->middleware('privilege:finance.payments.record');

    // Finance Expenses
    Route::get('/expenses', [ExpenseController::class, 'index'])->middleware('privilege:finance.view');
    Route::post('/expenses', [ExpenseController::class, 'store'])->middleware('privilege:finance.expenses.manage');
    Route::patch('/expenses/{expense}', [ExpenseController::class, 'update'])->middleware('privilege:finance.expenses.manage');
    Route::delete('/expenses/{expense}', [ExpenseController::class, 'destroy'])->middleware('privilege:finance.expenses.manage');

    // Finance Reports
    Route::get('/finance/reports/revenue', [FinanceReportController::class, 'revenue'])->middleware('privilege:finance.reports.view');
    Route::get('/finance/reports/outstanding', [FinanceReportController::class, 'outstanding'])->middleware('privilege:finance.reports.view');

    // HR Employee Profiles
    Route::get('/employees', [EmployeeController::class, 'index'])->middleware('privilege:hr.staff.manage');
    Route::post('/employees', [EmployeeController::class, 'store'])->middleware('privilege:hr.staff.manage');
    Route::patch('/employees/{employee}', [EmployeeController::class, 'update'])->middleware('privilege:hr.staff.manage');

    // HR Shifts
    Route::get('/shifts', [StaffShiftController::class, 'index'])->middleware('privilege:hr.shifts.manage');
    Route::post('/shifts', [StaffShiftController::class, 'store'])->middleware('privilege:hr.shifts.manage');
    Route::patch('/shifts/{shift}', [StaffShiftController::class, 'update'])->middleware('privilege:hr.shifts.manage');
    Route::delete('/shifts/{shift}', [StaffShiftController::class, 'destroy'])->middleware('privilege:hr.shifts.manage');

    // HR Staff Attendance (Clock-In/Clock-Out & Bulk sync)
    Route::post('/staff-attendance/clock-in', [StaffAttendanceController::class, 'clockIn'])->middleware('privilege:hr.attendance.view');
    Route::post('/staff-attendance/clock-out', [StaffAttendanceController::class, 'clockOut'])->middleware('privilege:hr.attendance.view');
    Route::post('/staff-attendance/bulk', [StaffAttendanceController::class, 'bulk'])->middleware('privilege:hr.attendance.view');

    // HR Leave Requests
    Route::get('/leave-requests', [LeaveRequestController::class, 'index'])->middleware('privilege:hr.staff.manage');
    Route::post('/leave-requests', [LeaveRequestController::class, 'store'])->middleware('privilege:hr.staff.manage');
    Route::patch('/leave-requests/{id}/approve', [LeaveRequestController::class, 'approve'])->middleware('privilege:hr.leave.approve');
    Route::patch('/leave-requests/{id}/reject', [LeaveRequestController::class, 'reject'])->middleware('privilege:hr.leave.approve');

    // HR Payroll Runs
    Route::post('/payroll-runs', [PayrollController::class, 'store'])->middleware('privilege:hr.payroll.manage');
    Route::patch('/payroll-runs/{id}/finalize', [PayrollController::class, 'finalize'])->middleware('privilege:hr.payroll.manage');
});
