<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

use App\Http\Controllers\AuthController;
use App\Http\Controllers\MemberController;
use App\Http\Controllers\MembershipPlanController;
use App\Http\Controllers\AttendanceController;
use App\Http\Controllers\SyncController;

// Unauthenticated route
Route::post('/login', [AuthController::class, 'login']);

// Authenticated, tenant-scoped routes
Route::middleware(['auth:sanctum', 'tenant'])->group(function () {
    Route::get('/auth/me', [AuthController::class, 'me']);

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
