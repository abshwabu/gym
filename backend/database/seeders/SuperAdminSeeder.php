<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * SuperAdminSeeder
 * 
 * WARNING: This seeder is dedicated strictly for platform-level onboarding and administration.
 * DO NOT execute it silently as part of a fresh database seed command in production.
 * Instead, call it explicitly using:
 *     php artisan db:seed --class=SuperAdminSeeder
 */
class SuperAdminSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        // 1. Check if a super admin already exists to prevent duplicate credentials overrides
        $existing = User::withoutGlobalScopes()
            ->whereNull('tenant_id')
            ->where('is_super_admin', true)
            ->first();

        if ($existing) {
            $this->command->warn('Platform Super Admin already exists. Skipping seeding.');
            return;
        }

        // 2. Fetch configurations from environment or fall back to safe defaults
        $email = env('SUPER_ADMIN_EMAIL', 'super@admin.test');
        $password = env('SUPER_ADMIN_PASSWORD');

        if (!$password) {
            $password = Str::random(12);
            $this->command->info('==================================================');
            $this->command->info("Super Admin Password not set in env. Generated temporary credentials:");
            $this->command->info("Email:    {$email}");
            $this->command->info("Password: {$password}");
            $this->command->info('==================================================');
        }

        // 3. Insert the Super Admin record (tenant_id = null, is_super_admin = true)
        User::create([
            'tenant_id' => null,
            'name' => 'Platform Super Admin',
            'email' => $email,
            'password' => Hash::make($password),
            'is_tenant_owner' => false,
            'is_super_admin' => true,
            'status' => 'active',
        ]);

        $this->command->info('Super Admin user seeded successfully.');
    }
}
