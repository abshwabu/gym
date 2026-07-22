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
        Schema::create('privileges', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('key')->unique(); // e.g. 'attendance.mark'
            $table->string('label');
            $table->string('category');
            $table->timestamps();
        });

        Schema::create('roles', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('tenant_id')->index();
            $table->string('name');
            $table->boolean('is_system_role')->default(false);
            $table->timestamps();

            $table->foreign('tenant_id')->references('id')->on('tenants')->onDelete('cascade');
            $table->unique(['tenant_id', 'name']);
        });

        Schema::create('role_privilege', function (Blueprint $table) {
            $table->uuid('role_id');
            $table->uuid('privilege_id');
            $table->timestamps();

            $table->primary(['role_id', 'privilege_id']);
            $table->foreign('role_id')->references('id')->on('roles')->onDelete('cascade');
            $table->foreign('privilege_id')->references('id')->on('privileges')->onDelete('cascade');
        });

        Schema::create('user_roles', function (Blueprint $table) {
            $table->uuid('user_id');
            $table->uuid('role_id');
            $table->timestamps();

            $table->primary(['user_id', 'role_id']);
            $table->foreign('user_id')->references('id')->on('users')->onDelete('cascade');
            $table->foreign('role_id')->references('id')->on('roles')->onDelete('cascade');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('user_roles');
        Schema::dropIfExists('role_privilege');
        Schema::dropIfExists('roles');
        Schema::dropIfExists('privileges');
    }
};
