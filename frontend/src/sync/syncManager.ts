import { db, type WriteQueueItem, type LocalMember, type LocalMembershipPlan, type LocalAttendance } from '../db/gymDb';

const API_BASE_URL = 'http://localhost:8000/api'; // Standard Laravel port

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

  /**
   * Perform a local operation: writes to local Dexie cache (Optimistic UI) and appends to the offline queue.
   */
  public static async queueWrite(
    table: 'members' | 'membership_plans' | 'attendance',
    action: 'create' | 'update',
    uuid: string,
    payload: any
  ) {
    const timestamp = new Date().toISOString();

    // 1. Optimistic Update in Local Dexie Cache
    if (table === 'members') {
      const existing = await db.members.get(uuid);
      const data: LocalMember = {
        ...existing,
        ...payload,
        id: uuid,
        updated_at: timestamp,
      };
      await db.members.put(data);
    } else if (table === 'membership_plans') {
      const existing = await db.membershipPlans.get(uuid);
      const data: LocalMembershipPlan = {
        ...existing,
        ...payload,
        id: uuid,
        updated_at: timestamp,
      };
      await db.membershipPlans.put(data);
    } else if (table === 'attendance') {
      const data: LocalAttendance = {
        ...payload,
        id: uuid,
        checked_in_at: payload.checked_in_at || timestamp,
      };
      await db.attendance.put(data);
    }

    // 2. Append to IndexedDB Write Queue
    const queueItem: WriteQueueItem = {
      uuid,
      table,
      action,
      payload,
      timestamp,
    };
    await db.writeQueue.add(queueItem);
    this.notifyQueueChanged();

    // 3. Trigger immediate sync attempt in background
    const token = localStorage.getItem('gym_auth_token');
    if (token) {
      this.syncNow(token).catch(console.error);
    }
  }

  /**
   * Process pending write queue items, pushing them to the backend API.
   */
  public static async syncNow(token: string): Promise<boolean> {
    if (this.syncInProgress) return false;
    if (!navigator.onLine) return false;

    const queueItems = await db.writeQueue.toArray();
    if (queueItems.length === 0) return true; // Nothing to sync

    this.syncInProgress = true;

    try {
      const response = await fetch(`${API_BASE_URL}/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ queue: queueItems }),
      });

      if (!response.ok) {
        throw new Error(`Sync API responded with status ${response.status}`);
      }

      const result = await response.json();

      if (result.success) {
        // Remove successfully synced items from IndexedDB queue
        const syncedIds = result.synced_ids as number[];
        await db.writeQueue.bulkDelete(syncedIds);

        // Fetch clean server data to overwrite local caches (resolving LWW conflicts)
        await this.pullFreshCaches(token);
        this.notifyQueueChanged();
        this.syncInProgress = false;
        return true;
      }
    } catch (error) {
      console.error('Offline Sync error:', error);
    } finally {
      this.syncInProgress = false;
    }

    return false;
  }

  /**
   * Download latest data from server and overwrite local IndexedDB databases.
   */
  public static async pullFreshCaches(token: string) {
    if (!navigator.onLine) return;

    try {
      const headers = {
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`,
      };

      // Fetch Members
      const membersRes = await fetch(`${API_BASE_URL}/members`, { headers });
      if (membersRes.ok) {
        const members = await membersRes.json();
        await db.members.clear();
        await db.members.bulkPut(members);
      }

      // Fetch Membership Plans
      const plansRes = await fetch(`${API_BASE_URL}/plans`, { headers });
      if (plansRes.ok) {
        const plans = await plansRes.json();
        await db.membershipPlans.clear();
        await db.membershipPlans.bulkPut(plans);
      }

      // Fetch Attendance
      const attendanceRes = await fetch(`${API_BASE_URL}/attendance`, { headers });
      if (attendanceRes.ok) {
        const attendance = await attendanceRes.json();
        await db.attendance.clear();
        await db.attendance.bulkPut(attendance);
      }
    } catch (e) {
      console.error('Failed to pull fresh server caches:', e);
    }
  }

  /**
   * Start the background sync loop and set up network event listeners.
   */
  public static startSyncCycle(token: string) {
    // Prevent multiple parallel cycles
    this.stopSyncCycle();

    // Perform initial pull
    this.pullFreshCaches(token).then(() => {
      this.syncNow(token).catch(console.error);
    });

    // Background sync cycle every 30 seconds when online
    this.intervalId = window.setInterval(() => {
      this.syncNow(token).catch(console.error);
    }, 30000);

    // Sync immediately when connection recovers
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
