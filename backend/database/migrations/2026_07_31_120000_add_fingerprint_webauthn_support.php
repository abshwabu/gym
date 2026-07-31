<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('member_webauthn_credentials', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('tenant_id')->index();
            $table->uuid('member_id')->index();
            $table->string('credential_id', 512)->unique();
            $table->text('public_key');
            $table->unsignedBigInteger('sign_count')->default(0);
            $table->string('transports', 255)->nullable();
            $table->string('device_name', 255)->nullable();
            $table->timestamp('last_used_at')->nullable();
            $table->timestamps();

            $table->foreign('tenant_id')->references('id')->on('tenants')->onDelete('cascade');
            $table->foreign('member_id')->references('id')->on('members')->onDelete('cascade');
        });

        $this->expandAttendanceMethodEnum();
    }

    /**
     * Expand attendances.method to include fingerprint across drivers.
     */
    private function expandAttendanceMethodEnum(): void
    {
        $driver = Schema::getConnection()->getDriverName();

        if ($driver === 'mysql') {
            DB::statement("ALTER TABLE attendances MODIFY COLUMN method ENUM('manual', 'qr_scan', 'kiosk', 'fingerprint') NOT NULL DEFAULT 'manual'");

            return;
        }

        if ($driver === 'pgsql') {
            DB::statement('ALTER TABLE attendances DROP CONSTRAINT IF EXISTS attendances_method_check');
            DB::statement("ALTER TABLE attendances ADD CONSTRAINT attendances_method_check CHECK (method::text = ANY (ARRAY['manual'::text, 'qr_scan'::text, 'kiosk'::text, 'fingerprint'::text]))");

            return;
        }

        // SQLite (and similar): rebuild table to refresh CHECK constraint from enum().
        Schema::disableForeignKeyConstraints();

        Schema::create('attendances_tmp_fp', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('tenant_id')->index();
            $table->uuid('member_id')->index();
            $table->uuid('member_plan_id')->nullable()->index();
            $table->timestamp('checked_in_at');
            $table->uuid('checked_in_by')->nullable()->index();
            $table->enum('method', ['manual', 'qr_scan', 'kiosk', 'fingerprint'])->default('manual');
            $table->timestamp('synced_at')->nullable();
            $table->timestamps();
        });

        DB::statement('INSERT INTO attendances_tmp_fp (id, tenant_id, member_id, member_plan_id, checked_in_at, checked_in_by, method, synced_at, created_at, updated_at)
            SELECT id, tenant_id, member_id, member_plan_id, checked_in_at, checked_in_by, method, synced_at, created_at, updated_at
            FROM attendances');

        Schema::drop('attendances');
        Schema::rename('attendances_tmp_fp', 'attendances');

        Schema::table('attendances', function (Blueprint $table) {
            $table->foreign('tenant_id')->references('id')->on('tenants')->onDelete('cascade');
            $table->foreign('member_id')->references('id')->on('members')->onDelete('cascade');
            $table->foreign('member_plan_id')->references('id')->on('member_plans')->onDelete('set null');
            $table->foreign('checked_in_by')->references('id')->on('users')->onDelete('set null');
        });

        Schema::enableForeignKeyConstraints();
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('member_webauthn_credentials');

        $driver = Schema::getConnection()->getDriverName();
        if ($driver === 'mysql') {
            DB::statement("ALTER TABLE attendances MODIFY COLUMN method ENUM('manual', 'qr_scan', 'kiosk') NOT NULL DEFAULT 'manual'");
        } elseif ($driver === 'pgsql') {
            DB::statement('ALTER TABLE attendances DROP CONSTRAINT IF EXISTS attendances_method_check');
            DB::statement("ALTER TABLE attendances ADD CONSTRAINT attendances_method_check CHECK (method::text = ANY (ARRAY['manual'::text, 'qr_scan'::text, 'kiosk'::text]))");
        }
        // SQLite down: leave expanded enum (safe enough for rollback in tests).
    }
};
