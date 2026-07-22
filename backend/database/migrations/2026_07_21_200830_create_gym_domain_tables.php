<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // 1. Create flexible plans table
        Schema::create('plans', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('tenant_id')->index();
            $table->string('name');
            $table->enum('billing_cycle', ['one_time', 'weekly', 'monthly', 'quarterly', 'annual', 'custom_days']);
            $table->integer('custom_cycle_days')->nullable();
            $table->decimal('price', 10, 2);
            $table->string('currency', 3)->default('USD');
            $table->integer('session_limit')->nullable();
            $table->json('access_hours')->nullable();
            $table->integer('freeze_allowance_days')->default(0);
            $table->boolean('is_active')->default(true);
            $table->softDeletes();
            $table->timestamps();

            $table->foreign('tenant_id')->references('id')->on('tenants')->onDelete('cascade');
        });

        // 2. Create members table
        Schema::create('members', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('tenant_id')->index();
            $table->string('first_name', 255);
            $table->string('last_name', 255);
            $table->string('email', 255)->nullable();
            $table->string('phone', 50)->nullable();
            $table->string('status', 50)->default('Active'); // Active, Inactive, Frozen
            $table->timestamps();

            $table->foreign('tenant_id')->references('id')->on('tenants')->onDelete('cascade');
        });

        // 3. Create member_plans subscriptions table
        Schema::create('member_plans', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('tenant_id')->index();
            $table->uuid('member_id')->index();
            $table->uuid('plan_id')->index();
            $table->timestamp('starts_at');
            $table->timestamp('expires_at');
            $table->enum('status', ['active', 'frozen', 'expired', 'cancelled'])->default('active');
            $table->integer('sessions_used')->default(0);
            $table->timestamp('frozen_at')->nullable();
            $table->integer('total_frozen_days')->default(0);
            $table->uuid('client_uuid')->nullable()->unique();
            $table->timestamps();

            $table->foreign('tenant_id')->references('id')->on('tenants')->onDelete('cascade');
            $table->foreign('member_id')->references('id')->on('members')->onDelete('cascade');
            $table->foreign('plan_id')->references('id')->on('plans')->onDelete('cascade');
        });

        // 4. Create attendances logs table
        Schema::create('attendances', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('tenant_id')->index();
            $table->uuid('member_id')->index();
            $table->uuid('member_plan_id')->nullable()->index();
            $table->timestamp('checked_in_at');
            $table->uuid('checked_in_by')->nullable()->index();
            $table->enum('method', ['manual', 'qr_scan', 'kiosk'])->default('manual');
            $table->timestamp('synced_at')->nullable();
            $table->timestamps();

            $table->foreign('tenant_id')->references('id')->on('tenants')->onDelete('cascade');
            $table->foreign('member_id')->references('id')->on('members')->onDelete('cascade');
            $table->foreign('member_plan_id')->references('id')->on('member_plans')->onDelete('set null');
            $table->foreign('checked_in_by')->references('id')->on('users')->onDelete('set null');
        });

        // 5. Create sync conflicts table
        Schema::create('sync_conflicts', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('tenant_id')->index();
            $table->string('entity_type', 100);
            $table->uuid('entity_id');
            $table->json('client_payload');
            $table->json('server_payload');
            $table->uuid('resolved_by')->nullable()->index();
            $table->timestamps();

            $table->foreign('tenant_id')->references('id')->on('tenants')->onDelete('cascade');
            $table->foreign('resolved_by')->references('id')->on('users')->onDelete('set null');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('sync_conflicts');
        Schema::dropIfExists('attendances');
        Schema::dropIfExists('member_plans');
        Schema::dropIfExists('members');
        Schema::dropIfExists('plans');
    }
};
