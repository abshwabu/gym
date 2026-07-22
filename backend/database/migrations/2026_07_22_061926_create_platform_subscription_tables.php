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
        // 1. subscription_plans table
        Schema::create('subscription_plans', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('name');
            $table->decimal('price', 10, 2);
            $table->string('currency', 3)->default('USD');
            $table->integer('duration_days');
            $table->integer('max_staff_users')->nullable();
            $table->integer('max_members')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        // 2. licenses table
        Schema::create('licenses', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('tenant_id');
            $table->uuid('subscription_plan_id');
            $table->string('license_key')->unique();
            $table->string('status')->default('active'); // active, expired, revoked
            $table->timestamp('starts_at');
            $table->timestamp('expires_at');
            $table->timestamp('last_validated_at')->nullable();
            $table->timestamps();

            $table->foreign('tenant_id')->references('id')->on('tenants')->onDelete('cascade');
            $table->foreign('subscription_plan_id')->references('id')->on('subscription_plans')->onDelete('cascade');
        });

        // 3. impersonation_logs table
        Schema::create('impersonation_logs', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('super_admin_id');
            $table->uuid('tenant_id');
            $table->uuid('impersonated_user_id');
            $table->timestamp('started_at');
            $table->timestamp('ended_at')->nullable();
            $table->text('reason');
            $table->timestamps();

            $table->foreign('super_admin_id')->references('id')->on('users')->onDelete('cascade');
            $table->foreign('tenant_id')->references('id')->on('tenants')->onDelete('cascade');
            $table->foreign('impersonated_user_id')->references('id')->on('users')->onDelete('cascade');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('impersonation_logs');
        Schema::dropIfExists('licenses');
        Schema::dropIfExists('subscription_plans');
    }
};
