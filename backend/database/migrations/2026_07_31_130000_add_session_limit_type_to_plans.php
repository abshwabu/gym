<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * session_limit_type:
     * - unlimited: no visit cap (session_limit is null)
     * - total: cap across the whole subscription (session_limit visits)
     * - per_week: calendar-week cap (Mon–Sun) counted from attendances
     * - per_month: calendar-month cap counted from attendances
     */
    public function up(): void
    {
        Schema::table('plans', function (Blueprint $table) {
            $table->string('session_limit_type', 20)
                ->default('unlimited')
                ->after('currency');
        });

        // Preserve prior semantics: null limit => unlimited, otherwise total punch-card.
        DB::table('plans')->whereNull('session_limit')->update([
            'session_limit_type' => 'unlimited',
        ]);
        DB::table('plans')->whereNotNull('session_limit')->update([
            'session_limit_type' => 'total',
        ]);
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('plans', function (Blueprint $table) {
            $table->dropColumn('session_limit_type');
        });
    }
};
