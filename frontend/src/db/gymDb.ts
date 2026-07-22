import Dexie, { type Table } from 'dexie';

export interface LocalMember {
  id: string; // UUID
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  status: string; // Active, Inactive, Frozen
  membership_plan_id: string | null;
  plan_expires_at: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface LocalMembershipPlan {
  id: string; // UUID
  name: string;
  price: number;
  duration_days: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface LocalAttendance {
  id: string; // UUID
  member_id: string;
  checked_in_at: string;
  created_at?: string;
  updated_at?: string;
}

export interface WriteQueueItem {
  id?: number; // Auto-incrementing local queue ID
  uuid: string; // UUID of domain model
  table: 'members' | 'membership_plans' | 'attendance';
  action: 'create' | 'update';
  payload: any;
  timestamp: string;
}

export interface LocalSyncConflictLog {
  id: string;
  table_name: string;
  record_id: string;
  client_payload: any;
  server_payload: any;
  resolved: boolean;
  created_at: string;
}

class GymDatabase extends Dexie {
  members!: Table<LocalMember, string>;
  membershipPlans!: Table<LocalMembershipPlan, string>;
  attendance!: Table<LocalAttendance, string>;
  writeQueue!: Table<WriteQueueItem, number>;
  syncConflictLogs!: Table<LocalSyncConflictLog, string>;

  constructor() {
    super('GymDatabase');
    this.version(1).stores({
      members: 'id, membership_plan_id, status',
      membershipPlans: 'id, is_active',
      attendance: 'id, member_id, checked_in_at',
      writeQueue: '++id, uuid, table, action',
      syncConflictLogs: 'id, table_name, record_id, resolved',
    });
  }
}

export const db = new GymDatabase();
