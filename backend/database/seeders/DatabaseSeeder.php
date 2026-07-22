<?php

namespace Database\Seeders;

use App\Models\Attendance;
use App\Models\Member;
use App\Models\MembershipPlan;
use App\Models\Privilege;
use App\Models\Role;
use App\Models\Tenant;
use App\Models\User;
use App\Services\TenantContext;
use App\Services\TenantProvisioning;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     */
    public function run(): void
    {
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
        $monthlyPlan = MembershipPlan::updateOrCreate(
            ['tenant_id' => $tenant->id, 'name' => 'Monthly Premium'],
            [
                'id' => 'b11b5103-6251-4e78-95ea-c4e9cb5e4d01',
                'price' => 49.99,
                'duration_days' => 30,
                'is_active' => true,
            ]
        );

        $annualPlan = MembershipPlan::updateOrCreate(
            ['tenant_id' => $tenant->id, 'name' => 'Annual Elite'],
            [
                'id' => 'b11b5103-6251-4e78-95ea-c4e9cb5e4d02',
                'price' => 479.99,
                'duration_days' => 365,
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
                'membership_plan_id' => $monthlyPlan->id,
                'plan_expires_at' => Carbon::now()->addDays(25),
            ]
        );

        $member2 = Member::updateOrCreate(
            ['tenant_id' => $tenant->id, 'first_name' => 'Jane', 'last_name' => 'Smith'],
            [
                'id' => 'c22c5103-6251-4e78-95ea-c4e9cb5e4d02',
                'email' => 'jane.smith@gmail.com',
                'phone' => '555-0120',
                'status' => 'Active',
                'membership_plan_id' => $annualPlan->id,
                'plan_expires_at' => Carbon::now()->addDays(200),
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
