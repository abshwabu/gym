<?php

namespace Database\Seeders;

use App\Models\SubscriptionPlan;
use Illuminate\Database\Seeder;

class SubscriptionPlanSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        // Starter Plan
        SubscriptionPlan::updateOrCreate(
            ['id' => '019f87cb-33f1-7166-80bb-6b6dfce3ac91'],
            [
                'name' => 'Starter Platform Plan',
                'price' => 29.00,
                'currency' => 'USD',
                'duration_days' => 30,
                'max_staff_users' => 3,
                'max_members' => 50,
                'is_active' => true,
            ]
        );

        // Pro Plan
        SubscriptionPlan::updateOrCreate(
            ['id' => '019f87cb-33f1-7166-80bb-6b6dfce3ac92'],
            [
                'name' => 'Pro Platform Plan',
                'price' => 79.00,
                'currency' => 'USD',
                'duration_days' => 30,
                'max_staff_users' => 10,
                'max_members' => 500,
                'is_active' => true,
            ]
        );

        // Multi-Branch Enterprise
        SubscriptionPlan::updateOrCreate(
            ['id' => '019f87cb-33f1-7166-80bb-6b6dfce3ac93'],
            [
                'name' => 'Enterprise Unlimited Platform Plan',
                'price' => 199.00,
                'currency' => 'USD',
                'duration_days' => 365,
                'max_staff_users' => null, // Unlimited
                'max_members' => null, // Unlimited
                'is_active' => true,
            ]
        );

        $this->command->info('Default platform subscription plans seeded.');
    }
}
