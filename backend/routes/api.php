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
});

// Authenticated, tenant-scoped routes
Route::middleware(['auth:sanctum', 'tenant'])->group(function () {
    Route::get('/auth/me', [AuthController::class, 'me']);
    Route::post('/logout', [AuthController::class, 'logout']);

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
});
