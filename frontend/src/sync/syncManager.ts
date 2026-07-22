import { db, type OutboxItem, type CacheMember, type CachePlan, type CacheMemberPlan, type CacheAttendance } from '../db/gymDb';

const API_BASE_URL = '/api';

export class SyncManager {
  private static syncInProgress = false;
  private static intervalId: number | null = null;
  private static onQueueChangeCallbacks: (() => void)[] = [];

  /**
   * Register a listener for queue changes (used to update UI status badges).
   */
  public static subscribeQueueChange(callback: () => void) {
    this.onQueueChangeCallbacks.push(callback);
    return () => {
      this.onQueueChangeCallbacks = this.onQueueChangeCallbacks.filter(c => c !== callback);
    };
  }

  private static notifyQueueChanged() {
    this.onQueueChangeCallbacks.forEach(cb => cb());
  }

  private static async apiRequest(path: string, method: string, body: any, token: string) {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${token}`,
    };

    // Add tenant slug if cached locally
    const tenantSlug = localStorage.getItem('tenant_slug');
    if (tenantSlug) {
      headers['X-Tenant-Slug'] = tenantSlug;
    }

    try {
      const response = await fetch(`${API_BASE_URL}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      if (response.status === 401) {
        localStorage.removeItem('gym_auth_token');
        return { status: 401, data: null };
      }

      const data = await response.json();
      return { status: response.status, data };
    } catch (error) {
      throw new Error('Network error');
    }
  }

  /**
   * Perform optimistic update in cache tables and queue write to outbox.
   */
  public static async queueWrite(
    entity: 'members' | 'plans' | 'member_plans' | 'attendances',
    method: 'create' | 'update' | 'delete',
    clientUuid: string,
    payload: any
  ) {
    const timestamp = new Date().toISOString();

    // 1. Optimistic Update on read-through caches
    if (entity === 'members') {
      if (method !== 'delete') {
        const existing = await db.cache_members.get(clientUuid);
        const data: CacheMember = {
          ...existing,
          ...payload,
          id: clientUuid,
          updated_at: timestamp,
        };
        await db.cache_members.put(data);
      }
    } else if (entity === 'plans') {
      if (method === 'delete') {
        await db.cache_plans.delete(clientUuid);
      } else {
        const existing = await db.cache_plans.get(clientUuid);
        const data: CachePlan = {
          ...existing,
          ...payload,
          id: clientUuid,
          updated_at: timestamp,
        };
        await db.cache_plans.put(data);
      }
    } else if (entity === 'member_plans') {
      if (method !== 'delete') {
        const existing = await db.cache_member_plans.get(clientUuid);
        const data: CacheMemberPlan = {
          ...existing,
          ...payload,
          id: clientUuid,
          updated_at: timestamp,
        };
        await db.cache_member_plans.put(data);
      }
    } else if (entity === 'attendances') {
      if (method === 'create') {
        const data: CacheAttendance = {
          id: clientUuid,
          tenant_id: payload.tenant_id || '',
          member_id: payload.member_id,
          member_plan_id: payload.member_plan_id || null,
          checked_in_at: payload.checked_in_at || timestamp,
          checked_in_by: payload.checked_in_by || null,
          method: payload.method || 'manual',
          synced_at: null,
          created_at: timestamp,
          updated_at: timestamp,
        };
        await db.cache_attendances.put(data);
      }
    }

    // 2. Append to outbox queue
    await db.outbox.add({
      entity,
      method,
      payload,
      clientUuid,
      createdAt: timestamp,
      status: 'pending',
    });

    this.notifyQueueChanged();

    // 3. Trigger immediate sync attempts
    const token = localStorage.getItem('gym_auth_token');
    if (token) {
      this.syncNow(token).catch(console.error);
    }
  }

  /**
   * Drain the outbox write queue, pushing offline updates to the backend.
   */
  public static async syncNow(token: string): Promise<boolean> {
    if (this.syncInProgress) return false;
    if (!navigator.onLine) return false;

    const pendingItems = await db.outbox
      .where('status')
      .equals('pending')
      .sortBy('localId');

    if (pendingItems.length === 0) return true;

    this.syncInProgress = true;

    try {
      let index = 0;
      while (index < pendingItems.length) {
        const currentItem = pendingItems[index];

        // 1. Group contiguous attendances to make a bulk call
        if (currentItem.entity === 'attendances' && currentItem.method === 'create') {
          const batch: OutboxItem[] = [];
          let j = index;
          while (
            j < pendingItems.length &&
            pendingItems[j].entity === 'attendances' &&
            pendingItems[j].method === 'create'
          ) {
            batch.push(pendingItems[j]);
            j++;
          }

          const payloadBatch = batch.map(item => ({
            ...item.payload,
            id: item.clientUuid,
          }));

          const { status, data } = await this.apiRequest('/attendances/bulk', 'POST', {
            attendances: payloadBatch,
          }, token);

          if (status === 200 && data.results) {
            for (let k = 0; k < batch.length; k++) {
              const outboxItem = batch[k];
              const res = data.results.find((r: any) => r.id === outboxItem.clientUuid);
              if (res && res.status !== 'failed') {
                await db.outbox.update(outboxItem.localId!, { status: 'synced' });
              } else {
                await db.outbox.update(outboxItem.localId!, { status: 'conflict' });
              }
            }
            index = j;
            continue;
          } else {
            for (const item of batch) {
              await db.outbox.update(item.localId!, { status: 'conflict' });
            }
            index = j;
            continue;
          }
        }

        // Group contiguous payments to make a bulk call
        if (currentItem.entity === 'payments' && currentItem.method === 'create') {
          const batch: OutboxItem[] = [];
          let j = index;
          while (
            j < pendingItems.length &&
            pendingItems[j].entity === 'payments' &&
            pendingItems[j].method === 'create'
          ) {
            batch.push(pendingItems[j]);
            j++;
          }

          const payloadBatch = batch.map(item => ({
            ...item.payload,
            id: item.clientUuid,
          }));

          const { status, data } = await this.apiRequest('/payments/bulk', 'POST', {
            payments: payloadBatch,
          }, token);

          if (status === 200 && data.results) {
            for (let k = 0; k < batch.length; k++) {
              const outboxItem = batch[k];
              const res = data.results.find((r: any) => r.id === outboxItem.clientUuid);
              if (res) {
                await db.outbox.update(outboxItem.localId!, { status: 'synced' });
              } else {
                await db.outbox.update(outboxItem.localId!, { status: 'conflict' });
              }
            }
            index = j;
            continue;
          } else {
            for (const item of batch) {
              await db.outbox.update(item.localId!, { status: 'conflict' });
            }
            index = j;
            continue;
          }
        }

        // 2. Individual endpoint uploads for editable entities
        let path = '';
        let method = 'POST';
        const body = { ...currentItem.payload, id: currentItem.clientUuid, updated_at: currentItem.createdAt };

        if (currentItem.entity === 'members') {
          path = '/members';
          method = 'POST';
        } else if (currentItem.entity === 'invoices') {
          if (currentItem.method === 'create') {
            path = '/invoices';
            method = 'POST';
          } else if (currentItem.method === 'update') {
            path = `/invoices/${currentItem.clientUuid}`;
            method = 'PATCH';
          }
        } else if (currentItem.entity === 'expenses') {
          if (currentItem.method === 'create') {
            path = '/expenses';
            method = 'POST';
          } else if (currentItem.method === 'update') {
            path = `/expenses/${currentItem.clientUuid}`;
            method = 'PATCH';
          } else if (currentItem.method === 'delete') {
            path = `/expenses/${currentItem.clientUuid}`;
            method = 'DELETE';
          }
        } else if (currentItem.entity === 'plans') {
          if (currentItem.method === 'create') {
            path = '/plans';
            method = 'POST';
          } else if (currentItem.method === 'update') {
            path = `/plans/${currentItem.clientUuid}`;
            method = 'PATCH';
          } else if (currentItem.method === 'delete') {
            path = `/plans/${currentItem.clientUuid}`;
            method = 'DELETE';
          }
        } else if (currentItem.entity === 'member_plans') {
          if (currentItem.method === 'create') {
            path = `/members/${currentItem.payload.member_id}/plans`;
            method = 'POST';
          } else if (currentItem.method === 'update') {
            if (currentItem.payload.status === 'frozen') {
              path = `/member-plans/${currentItem.payload.id}/freeze`;
              method = 'POST';
            } else if (currentItem.payload.status === 'active') {
              path = `/member-plans/${currentItem.payload.id}/unfreeze`;
              method = 'POST';
            }
          }
        }

        const { status } = await this.apiRequest(path, method, body, token);

        if (status >= 200 && status < 300) {
          await db.outbox.update(currentItem.localId!, { status: 'synced' });
        } else if (status === 400 || status === 422) {
          // Conflict/validation failure
          await db.outbox.update(currentItem.localId!, { status: 'conflict' });
        } else {
          // Connection loss / temporary server error: stop draining
          break;
        }

        index++;
      }

      // Delta Pull fresh caches to reconcile conflicts
      await this.pullFreshCaches(token);

      // Silently refresh the locally verifiable license token
      try {
        const res = await fetch('/api/license/refresh', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json',
          }
        });
        if (res.ok) {
          const data = await res.json();
          localStorage.setItem('license_token', data.token);
        }
      } catch (e) {
        // Silent catch
      }
      
      this.notifyQueueChanged();
      this.syncInProgress = false;
      return true;
    } catch (error) {
      console.warn('Sync halt: connection error.', error);
    } finally {
      this.syncInProgress = false;
    }

    return false;
  }

  /**
   * Perform pull-based delta synchronization.
   */
  public static async pullFreshCaches(token: string) {
    if (!navigator.onLine) return;

    const since = localStorage.getItem('last_sync_timestamp') || '';

    try {
      const { status, data } = await this.apiRequest(`/sync/changes?since=${encodeURIComponent(since)}`, 'GET', null, token);

      if (status === 200 && data) {
        if (data.members && data.members.length > 0) {
          await db.cache_members.bulkPut(data.members);
        }

        if (data.plans && data.plans.length > 0) {
          for (const plan of data.plans) {
            if (plan.deleted_at) {
              await db.cache_plans.delete(plan.id);
            } else {
              await db.cache_plans.put(plan);
            }
          }
        }

        if (data.member_plans && data.member_plans.length > 0) {
          await db.cache_member_plans.bulkPut(data.member_plans);
        }

        if (data.attendances && data.attendances.length > 0) {
          await db.cache_attendances.bulkPut(data.attendances);
        }

        localStorage.setItem('last_sync_timestamp', data.since);
      }
    } catch (e) {
      console.error('Failed to pull fresh server caches:', e);
    }
  }

  /**
   * Start periodic background sync.
   */
  public static startSyncCycle(token: string) {
    this.stopSyncCycle();

    this.pullFreshCaches(token).then(() => {
      this.syncNow(token).catch(console.error);
    });

    this.intervalId = window.setInterval(() => {
      this.syncNow(token).catch(console.error);
    }, 30000);

    window.addEventListener('online', this.handleOnlineEvent);
  }

  public static stopSyncCycle() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    window.removeEventListener('online', this.handleOnlineEvent);
  }

  private static handleOnlineEvent = () => {
    const token = localStorage.getItem('gym_auth_token');
    if (token) {
      this.syncNow(token).catch(console.error);
    }
  };
}
