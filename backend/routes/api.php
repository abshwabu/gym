<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

use App\Http\Controllers\AuthController;
use App\Http\Controllers\MemberController;
use App\Http\Controllers\MembershipPlanController;
use App\Http\Controllers\AttendanceController;
use App\Http\Controllers\SyncController;
use App\Http\Controllers\InvitationController;
use App\Http\Controllers\RoleController;

// Unauthenticated routes
Route::post('/login', [AuthController::class, 'login']);
Route::post('/staff/activate/{user}', [InvitationController::class, 'activate'])
    ->name('invitation.activate')
    ->middleware('signed');

// Authenticated, tenant-scoped routes
Route::middleware(['auth:sanctum', 'tenant'])->group(function () {
    Route::get('/auth/me', [AuthController::class, 'me']);
    Route::post('/logout', [AuthController::class, 'logout']);

    // Staff invitations
    Route::post('/staff/invite', [InvitationController::class, 'invite'])->middleware('privilege:staff.invite');

    // Roles CRUD
    Route::get('/roles', [RoleController::class, 'index'])->middleware('privilege:roles.view');
    Route::post('/roles', [RoleController::class, 'store'])->middleware('privilege:roles.create');
    Route::patch('/roles/{id}', [RoleController::class, 'update'])->middleware('privilege:roles.edit');
    Route::delete('/roles/{id}', [RoleController::class, 'destroy'])->middleware('privilege:roles.delete');
    Route::post('/roles/{id}/privileges', [RoleController::class, 'syncPrivileges'])->middleware('privilege:roles.edit');

    // Members
    Route::get('/members', [MemberController::class, 'index'])->middleware('privilege:members.view');
    Route::post('/members', [MemberController::class, 'store'])->middleware('privilege:members.create');

    // Plans
    Route::get('/plans', [MembershipPlanController::class, 'index'])->middleware('privilege:plans.view');
    Route::post('/plans', [MembershipPlanController::class, 'store'])->middleware('privilege:plans.create');

    // Attendance
    Route::get('/attendance', [AttendanceController::class, 'index'])->middleware('privilege:attendance.view');
    Route::post('/attendance', [AttendanceController::class, 'store'])->middleware('privilege:attendance.mark');

    // Offline Batch Sync
    Route::post('/sync', [SyncController::class, 'sync']);
});
