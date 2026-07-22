<?php

namespace Database\Seeders;

use App\Models\Attendance;
use App\Models\Member;
use App\Models\Plan;
use App\Models\MemberPlan;
use App\Models\Privilege;
use App\Models\Role;
use App\Models\Tenant;
use App\Models\User;
use App\Services\TenantContext;
use App\Services\TenantProvisioning;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;

/**
 * DatabaseSeeder
 * 
 * NOTE: The platform-level SuperAdminSeeder is excluded from the main array
 * to prevent silent production deployment seeding of platform access credentials.
 * To seed the super admin account explicitly, run:
 *     php artisan db:seed --class=SuperAdminSeeder
 */
class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        // Seed default platform subscription plans
        $this->call(SubscriptionPlanSeeder::class);

        // 1. Seed global privileges (UUIDs auto-generated)
        $privileges = [
            // Members
            ['key' => 'members.view', 'label' => 'View Members', 'category' => 'Members'],
            ['key' => 'members.create', 'label' => 'Create Members', 'category' => 'Members'],
            ['key' => 'members.update', 'label' => 'Update Members', 'category' => 'Members'],
            ['key' => 'members.delete', 'label' => 'Delete Members', 'category' => 'Members'],
            
            // Plans
            ['key' => 'plans.view', 'label' => 'View Plans', 'category' => 'Plans'],
            ['key' => 'plans.create', 'label' => 'Create Plans', 'category' => 'Plans'],
            ['key' => 'plans.update', 'label' => 'Update Plans', 'category' => 'Plans'],
            ['key' => 'plans.delete', 'label' => 'Delete Plans', 'category' => 'Plans'],
            
            // Attendance
            ['key' => 'attendance.view', 'label' => 'View Attendance', 'category' => 'Attendance'],
            ['key' => 'attendance.mark', 'label' => 'Mark Attendance', 'category' => 'Attendance'],
            ['key' => 'attendance.update', 'label' => 'Update Attendance', 'category' => 'Attendance'],
            
            // Roles
            ['key' => 'roles.view', 'label' => 'View Roles', 'category' => 'Roles'],
            ['key' => 'roles.create', 'label' => 'Create Roles', 'category' => 'Roles'],
            ['key' => 'roles.update', 'label' => 'Update Roles', 'category' => 'Roles'],
            ['key' => 'roles.delete', 'label' => 'Delete Roles', 'category' => 'Roles'],
            
            // Staff
            ['key' => 'staff.view', 'label' => 'View Staff', 'category' => 'Staff'],
            ['key' => 'staff.invite', 'label' => 'Invite Staff', 'category' => 'Staff'],
            ['key' => 'staff.update', 'label' => 'Update Staff', 'category' => 'Staff'],
            ['key' => 'staff.disable', 'label' => 'Disable Staff', 'category' => 'Staff'],

            // Finance
            ['key' => 'finance.view', 'label' => 'View Finance Module', 'category' => 'Finance'],
            ['key' => 'finance.invoices.manage', 'label' => 'Manage Invoices', 'category' => 'Finance'],
            ['key' => 'finance.payments.record', 'label' => 'Record Payments', 'category' => 'Finance'],
            ['key' => 'finance.expenses.manage', 'label' => 'Manage Expenses', 'category' => 'Finance'],
            ['key' => 'finance.reports.view', 'label' => 'View Finance Reports', 'category' => 'Finance'],

            // HR
            ['key' => 'hr.staff.manage', 'label' => 'Manage HR Staff Profiles', 'category' => 'HR'],
            ['key' => 'hr.attendance.view', 'label' => 'View Staff Attendance', 'category' => 'HR'],
            ['key' => 'hr.shifts.manage', 'label' => 'Manage Staff Shifts', 'category' => 'HR'],
            ['key' => 'hr.leave.approve', 'label' => 'Approve Leave Requests', 'category' => 'HR'],
            ['key' => 'hr.payroll.manage', 'label' => 'Manage Payroll Runs', 'category' => 'HR'],
        ];

        foreach ($privileges as $priv) {
            Privilege::updateOrCreate(
                ['key' => $priv['key']],
                [
                    'label' => $priv['label'],
                    'category' => $priv['category']
                ]
            );
        }

        // 2. Use TenantProvisioning service to create the primary Tenant and its Owner
        $tenant = Tenant::where('slug', 'apex')->first();
        if (!$tenant) {
            $provisioner = new TenantProvisioning();
            $tenant = $provisioner->provision(
                'Apex Fitness',
                'apex',
                'active',
                [
                    'name' => 'Admin User',
                    'email' => 'admin@apex.com',
                    'password' => 'password',
                    'status' => 'active'
                ]
            );
        }

        // Set the context for seeding supplementary tenant-scoped records
        TenantContext::setTenant($tenant);

        // 3. Create Manager and Front Desk roles
        $managerRole = Role::updateOrCreate(
            ['tenant_id' => $tenant->id, 'name' => 'Manager'],
            ['is_system_role' => false]
        );
        $managerPrivileges = Privilege::whereIn('key', [
            'members.view', 'members.create', 'members.update',
            'plans.view',
            'attendance.view', 'attendance.mark',
            'staff.view'
        ])->pluck('id')->toArray();
        $managerRole->privileges()->sync($managerPrivileges);

        $frontDeskRole = Role::updateOrCreate(
            ['tenant_id' => $tenant->id, 'name' => 'Front Desk'],
            ['is_system_role' => false]
        );
        $frontDeskPrivileges = Privilege::whereIn('key', [
            'members.view',
            'attendance.view', 'attendance.mark'
        ])->pluck('id')->toArray();
        $frontDeskRole->privileges()->sync($frontDeskPrivileges);

        // 4. Create Staff User
        $staffUser = User::updateOrCreate(
            ['tenant_id' => $tenant->id, 'email' => 'staff@apex.com'],
            [
                'name' => 'Staff User',
                'password' => bcrypt('password'),
                'is_tenant_owner' => false,
                'status' => 'active'
            ]
        );
        $staffUser->roles()->sync([$frontDeskRole->id]);

        // 5. Seed Membership Plans
        $monthlyPlan = Plan::updateOrCreate(
            ['tenant_id' => $tenant->id, 'name' => 'Monthly Premium'],
            [
                'id' => 'b11b5103-6251-4e78-95ea-c4e9cb5e4d01',
                'billing_cycle' => 'monthly',
                'price' => 49.99,
                'currency' => 'USD',
                'freeze_allowance_days' => 15,
                'is_active' => true,
            ]
        );

        $annualPlan = Plan::updateOrCreate(
            ['tenant_id' => $tenant->id, 'name' => 'Annual Elite'],
            [
                'id' => 'b11b5103-6251-4e78-95ea-c4e9cb5e4d02',
                'billing_cycle' => 'annual',
                'price' => 479.99,
                'currency' => 'USD',
                'freeze_allowance_days' => 45,
                'is_active' => true,
            ]
        );

        // 6. Seed Members
        $member1 = Member::updateOrCreate(
            ['tenant_id' => $tenant->id, 'first_name' => 'John', 'last_name' => 'Doe'],
            [
                'id' => 'c22c5103-6251-4e78-95ea-c4e9cb5e4d01',
                'email' => 'john.doe@gmail.com',
                'phone' => '555-0199',
                'status' => 'Active',
            ]
        );

        $member2 = Member::updateOrCreate(
            ['tenant_id' => $tenant->id, 'first_name' => 'Jane', 'last_name' => 'Smith'],
            [
                'id' => 'c22c5103-6251-4e78-95ea-c4e9cb5e4d02',
                'email' => 'jane.smith@gmail.com',
                'phone' => '555-0120',
                'status' => 'Active',
            ]
        );

        // Seed Member Plan Subscriptions
        $startsAt = Carbon::now()->subDays(5);
        $sub1 = MemberPlan::updateOrCreate(
            ['id' => 'e11e5103-6251-4e78-95ea-c4e9cb5e4d01'],
            [
                'tenant_id' => $tenant->id,
                'member_id' => $member1->id,
                'plan_id' => $monthlyPlan->id,
                'starts_at' => $startsAt,
                'expires_at' => $startsAt->copy()->addMonth(),
                'status' => 'active',
                'sessions_used' => 2,
            ]
        );

        $sub2 = MemberPlan::updateOrCreate(
            ['id' => 'e11e5103-6251-4e78-95ea-c4e9cb5e4d02'],
            [
                'tenant_id' => $tenant->id,
                'member_id' => $member2->id,
                'plan_id' => $annualPlan->id,
                'starts_at' => $startsAt,
                'expires_at' => $startsAt->copy()->addYear(),
                'status' => 'active',
                'sessions_used' => 0,
            ]
        );

        // 7. Seed Attendance Logs
        Attendance::updateOrCreate(
            ['id' => 'd33d5103-6251-4e78-95ea-c4e9cb5e4d01'],
            [
                'tenant_id' => $tenant->id,
                'member_id' => $member1->id,
                'checked_in_at' => Carbon::now()->subDays(2),
            ]
        );

        Attendance::updateOrCreate(
            ['id' => 'd33d5103-6251-4e78-95ea-c4e9cb5e4d02'],
            [
                'tenant_id' => $tenant->id,
                'member_id' => $member1->id,
                'checked_in_at' => Carbon::now()->subDay(),
            ]
        );

        // Clear the context when done
        TenantContext::clear();
    }
}
