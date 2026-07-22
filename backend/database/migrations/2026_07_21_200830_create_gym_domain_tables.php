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
        Schema::create('membership_plans', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('tenant_id')->index();
            $table->string('name', 255);
            $table->decimal('price', 10, 2);
            $table->integer('duration_days');
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->foreign('tenant_id')->references('id')->on('tenants')->onDelete('cascade');
        });

        Schema::create('members', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('tenant_id')->index();
            $table->string('first_name', 255);
            $table->string('last_name', 255);
            $table->string('email', 255)->nullable();
            $table->string('phone', 50)->nullable();
            $table->string('status', 50)->default('Active'); // Active, Inactive, Frozen
            $table->uuid('membership_plan_id')->nullable()->index();
            $table->timestamp('plan_expires_at')->nullable();
            $table->timestamps();

            $table->foreign('tenant_id')->references('id')->on('tenants')->onDelete('cascade');
            $table->foreign('membership_plan_id')->references('id')->on('membership_plans')->onDelete('set null');
        });

        Schema::create('attendance', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('tenant_id')->index();
            $table->uuid('member_id')->index();
            $table->timestamp('checked_in_at');
            $table->timestamps();

            $table->foreign('tenant_id')->references('id')->on('tenants')->onDelete('cascade');
            $table->foreign('member_id')->references('id')->on('members')->onDelete('cascade');
        });

        Schema::create('sync_conflict_logs', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('tenant_id')->index();
            $table->string('table_name', 100);
            $table->uuid('record_id');
            $table->json('client_payload');
            $table->json('server_payload');
            $table->boolean('resolved')->default(false);
            $table->timestamps();

            $table->foreign('tenant_id')->references('id')->on('tenants')->onDelete('cascade');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('sync_conflict_logs');
        Schema::dropIfExists('attendance');
        Schema::dropIfExists('members');
        Schema::dropIfExists('membership_plans');
    }
};
