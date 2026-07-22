import Dexie, { type Table } from 'dexie';

export interface OutboxItem {
  localId?: number; // Auto-incrementing local ID
  entity: 'members' | 'plans' | 'member_plans' | 'attendances';
  method: 'create' | 'update' | 'delete';
  payload: any;
  clientUuid: string;
  createdAt: string;
  status: 'pending' | 'synced' | 'conflict';
}

export interface CacheMember {
  id: string; // UUID primary key
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  status: string; // Active, Inactive, Frozen
  created_at?: string;
  updated_at?: string;
}

export interface CachePlan {
  id: string; // UUID primary key
  name: string;
  billing_cycle: 'one_time' | 'weekly' | 'monthly' | 'quarterly' | 'annual' | 'custom_days';
  custom_cycle_days: number | null;
  price: number;
  currency: string;
  session_limit: number | null;
  access_hours: any | null;
  freeze_allowance_days: number;
  is_active: boolean;
  deleted_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface CacheMemberPlan {
  id: string; // UUID primary key
  tenant_id: string;
  member_id: string;
  plan_id: string;
  starts_at: string;
  expires_at: string;
  status: 'active' | 'frozen' | 'expired' | 'cancelled';
  sessions_used: number;
  frozen_at?: string | null;
  total_frozen_days: number;
  client_uuid?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface CacheAttendance {
  id: string; // UUID primary key
  tenant_id: string;
  member_id: string;
  member_plan_id: string | null;
  checked_in_at: string;
  checked_in_by: string | null;
  method: 'manual' | 'qr_scan' | 'kiosk';
  synced_at: string | null;
  created_at?: string;
  updated_at?: string;
}

class GymDatabase extends Dexie {
  outbox!: Table<OutboxItem, number>;
  cache_members!: Table<CacheMember, string>;
  cache_plans!: Table<CachePlan, string>;
  cache_member_plans!: Table<CacheMemberPlan, string>;
  cache_attendances!: Table<CacheAttendance, string>;

  constructor() {
    super('GymDatabase');
    // Bump database version to 2 for updated schema stores
    this.version(2).stores({
      outbox: '++localId, entity, clientUuid, status',
      cache_members: 'id, status',
      cache_plans: 'id, is_active',
      cache_member_plans: 'id, member_id, plan_id, status',
      cache_attendances: 'id, member_id, member_plan_id, checked_in_at',
    });
  }
}

export const db = new GymDatabase();
