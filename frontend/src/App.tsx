import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db/gymDb';
import { SyncManager } from './sync/syncManager';
import {
  Activity,
  Users,
  CreditCard,
  CheckCircle,
  AlertTriangle,
  Plus,
  Search,
  LogOut,
  Wifi,
  WifiOff,
  UserPlus,
  RefreshCw,
  Clock,
  CheckSquare
} from 'lucide-react';

export default function App() {
  // Authentication State
  const [token, setToken] = useState<string | null>(localStorage.getItem('gym_auth_token'));
  const [user, setUser] = useState<any>(JSON.parse(localStorage.getItem('gym_user') || 'null'));
  const [tenant, setTenant] = useState<any>(JSON.parse(localStorage.getItem('gym_tenant') || 'null'));
  const [roles, setRoles] = useState<string[]>(JSON.parse(localStorage.getItem('gym_roles') || '[]'));
  const [privileges, setPrivileges] = useState<string[]>(JSON.parse(localStorage.getItem('gym_privileges') || '[]'));

  // Login Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // App Navigation Tab
  const [activeTab, setActiveTab] = useState<'dashboard' | 'members' | 'plans' | 'attendance'>('dashboard');

  // Online / Offline Status
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Toast Alerts
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);

  // Search Filters
  const [memberSearch, setMemberSearch] = useState('');
  const [checkinSearch, setCheckinSearch] = useState('');

  // Modals Open State
  const [showMemberModal, setShowMemberModal] = useState(false);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [editingMember, setEditingMember] = useState<any>(null);

  // Form Field States - Member
  const [memberForm, setMemberForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    status: 'Active',
    membership_plan_id: '',
  });

  // Form Field States - Plan
  const [planForm, setPlanForm] = useState({
    name: '',
    price: '',
    duration_days: '30',
    is_active: true,
  });

  // Sync state trigger listener
  const [queueLength, setQueueLength] = useState(0);

  // Show Toast Helper
  const showToast = (message: string, type: 'success' | 'error' | 'warning' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Listen to network status changes
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      showToast('Network connection restored. Syncing...', 'success');
      if (token) SyncManager.syncNow(token).catch(console.error);
    };
    const handleOffline = () => {
      setIsOnline(false);
      showToast('Working offline. Actions will be queued.', 'warning');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial background sync cycle setup
    if (token) {
      SyncManager.startSyncCycle(token);
    }

    // Subscribe to write queue size changes
    const unsubscribe = SyncManager.subscribeQueueChange(async () => {
      const q = await db.writeQueue.count();
      setQueueLength(q);
    });

    // Initial queue count
    db.writeQueue.count().then(setQueueLength);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      SyncManager.stopSyncCycle();
      unsubscribe();
    };
  }, [token]);

  // Live Queries using Dexie React hooks
  const members = useLiveQuery(() => db.members.toArray()) || [];
  const plans = useLiveQuery(() => db.membershipPlans.toArray()) || [];
  const attendances = useLiveQuery(async () => {
    const list = await db.attendance.toArray();
    // Sort descending by checked_in_at
    return list.sort((a, b) => new Date(b.checked_in_at).getTime() - new Date(a.checked_in_at).getTime());
  }) || [];

  // Helper check for privilege permissions
  const hasPrivilege = (priv: string) => {
    return privileges.includes(priv);
  };

  // Perform Login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setIsLoggingIn(true);

    try {
      const response = await fetch('http://localhost:8000/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        setLoginError(data.message || 'Login failed. Invalid credentials.');
        setIsLoggingIn(false);
        return;
      }

      // Save credentials locally
      localStorage.setItem('gym_auth_token', data.token);
      localStorage.setItem('gym_user', JSON.stringify(data.user));
      localStorage.setItem('gym_tenant', JSON.stringify(data.tenant));
      localStorage.setItem('gym_roles', JSON.stringify(data.roles));
      localStorage.setItem('gym_privileges', JSON.stringify(data.privileges));

      setToken(data.token);
      setUser(data.user);
      setTenant(data.tenant);
      setRoles(data.roles);
      setPrivileges(data.privileges);

      showToast(`Welcome back to ${data.tenant.name}!`);

      // Initialize background sync
      SyncManager.startSyncCycle(data.token);
    } catch (err) {
      console.error(err);
      setLoginError('Could not connect to the authentication server.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Perform Logout
  const handleLogout = () => {
    localStorage.removeItem('gym_auth_token');
    localStorage.removeItem('gym_user');
    localStorage.removeItem('gym_tenant');
    localStorage.removeItem('gym_roles');
    localStorage.removeItem('gym_privileges');
    setToken(null);
    setUser(null);
    setTenant(null);
    setRoles([]);
    setPrivileges([]);
    SyncManager.stopSyncCycle();
    showToast('Logged out successfully.');
  };

  // Manual Trigger Force Sync
  const handleForceSync = async () => {
    if (!token) return;
    showToast('Triggering database sync...', 'warning');
    const success = await SyncManager.syncNow(token);
    if (success) {
      showToast('Offline sync transaction completed successfully!');
    } else if (!isOnline) {
      showToast('You are currently offline. Cannot sync.', 'error');
    } else {
      showToast('Sync completed. Some items resolved or logged.', 'success');
    }
  };

  // Perform Member Check-in
  const handleCheckin = async (memberId: string) => {
    const member = members.find(m => m.id === memberId);
    if (!member) return;

    if (member.status !== 'Active') {
      showToast(`Cannot check in: Member status is "${member.status}"`, 'error');
      return;
    }

    // Verify membership expiry
    if (member.plan_expires_at && new Date(member.plan_expires_at) < new Date()) {
      showToast(`Cannot check in: Member's subscription expired!`, 'error');
      return;
    }

    const attendanceId = crypto.randomUUID();
    const checked_in_at = new Date().toISOString();

    const payload = {
      id: attendanceId,
      member_id: memberId,
      checked_in_at,
    };

    try {
      await SyncManager.queueWrite('attendance', 'create', attendanceId, payload);
      showToast(`Successfully checked in ${member.first_name} ${member.last_name}!`);
      setCheckinSearch('');
    } catch (e) {
      console.error(e);
      showToast('Failed to check in member.', 'error');
    }
  };

  // Create or Update Member
  const handleMemberSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const selectedPlan = plans.find(p => p.id === memberForm.membership_plan_id);
    let plan_expires_at: string | null = null;

    if (selectedPlan && memberForm.status === 'Active') {
      const days = selectedPlan.duration_days;
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + days);
      plan_expires_at = expiryDate.toISOString();
    }

    const memberId = editingMember ? editingMember.id : crypto.randomUUID();
    const action = editingMember ? 'update' : 'create';

    const payload = {
      first_name: memberForm.first_name,
      last_name: memberForm.last_name,
      email: memberForm.email || null,
      phone: memberForm.phone || null,
      status: memberForm.status,
      membership_plan_id: memberForm.membership_plan_id || null,
      plan_expires_at,
    };

    try {
      await SyncManager.queueWrite('members', action, memberId, payload);
      showToast(editingMember ? 'Member profile updated.' : 'New member registered.');
      setShowMemberModal(false);
      setEditingMember(null);
      setMemberForm({
        first_name: '',
        last_name: '',
        email: '',
        phone: '',
        status: 'Active',
        membership_plan_id: '',
      });
    } catch (e) {
      console.error(e);
      showToast('Error saving member.', 'error');
    }
  };

  // Create Membership Plan
  const handlePlanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const planId = crypto.randomUUID();
    const payload = {
      name: planForm.name,
      price: parseFloat(planForm.price),
      duration_days: parseInt(planForm.duration_days),
      is_active: planForm.is_active,
    };

    try {
      await SyncManager.queueWrite('membership_plans', 'create', planId, payload);
      showToast(`Membership plan "${planForm.name}" created.`);
      setShowPlanModal(false);
      setPlanForm({
        name: '',
        price: '',
        duration_days: '30',
        is_active: true,
      });
    } catch (e) {
      console.error(e);
      showToast('Error creating plan.', 'error');
    }
  };

  // Render Login Screen if not authenticated
  if (!token) {
    return (
      <div className="login-container">
        <div className="card login-card">
          <div className="login-header">
            <h1>A P E X</h1>
            <p>Gym Management Suite</p>
          </div>
          
          {loginError && <div className="login-error">{loginError}</div>}

          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label className="form-label" htmlFor="login-email">Email Address</label>
              <input
                id="login-email"
                type="email"
                className="form-input"
                placeholder="admin@apex.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="login-password">Password</label>
              <input
                id="login-password"
                type="password"
                className="form-input"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '10px' }} disabled={isLoggingIn}>
              {isLoggingIn ? 'Authenticating...' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Active check-in search filters
  const filteredCheckinMembers = checkinSearch.trim() === ''
    ? []
    : members.filter(m => {
        const full = `${m.first_name} ${m.last_name}`.toLowerCase();
        return full.includes(checkinSearch.toLowerCase()) || (m.phone && m.phone.includes(checkinSearch));
      }).slice(0, 5);

  // Member search filters
  const filteredMembers = members.filter(m => {
    const full = `${m.first_name} ${m.last_name}`.toLowerCase();
    const matchText = full.includes(memberSearch.toLowerCase()) || (m.phone && m.phone.includes(memberSearch)) || (m.email && m.email.toLowerCase().includes(memberSearch.toLowerCase()));
    return matchText;
  });

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <Activity size={24} style={{ color: 'var(--accent-purple)' }} />
          <span>A P E X</span>
        </div>

        <nav className="sidebar-nav">
          <button onClick={() => setActiveTab('dashboard')} className={`sidebar-link ${activeTab === 'dashboard' ? 'active' : ''}`} style={{ border: 'none', background: 'none', width: '100%', textAlign: 'left', cursor: 'pointer' }}>
            <Activity size={18} />
            <span>Dashboard</span>
          </button>

          {hasPrivilege('members.view') && (
            <button onClick={() => setActiveTab('members')} className={`sidebar-link ${activeTab === 'members' ? 'active' : ''}`} style={{ border: 'none', background: 'none', width: '100%', textAlign: 'left', cursor: 'pointer' }}>
              <Users size={18} />
              <span>Members</span>
            </button>
          )}

          {hasPrivilege('plans.view') && (
            <button onClick={() => setActiveTab('plans')} className={`sidebar-link ${activeTab === 'plans' ? 'active' : ''}`} style={{ border: 'none', background: 'none', width: '100%', textAlign: 'left', cursor: 'pointer' }}>
              <CreditCard size={18} />
              <span>Membership Plans</span>
            </button>
          )}

          {hasPrivilege('attendance.view') && (
            <button onClick={() => setActiveTab('attendance')} className={`sidebar-link ${activeTab === 'attendance' ? 'active' : ''}`} style={{ border: 'none', background: 'none', width: '100%', textAlign: 'left', cursor: 'pointer' }}>
              <CheckSquare size={18} />
              <span>Attendance History</span>
            </button>
          )}
        </nav>

        <div className="sidebar-footer">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '16px' }}>
            <span style={{ fontSize: '14px', fontWeight: '600' }}>{user.name}</span>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{roles[0] || 'Staff'}</span>
          </div>

          <button onClick={handleLogout} className="sidebar-link" style={{ width: '100%', border: 'none', background: 'none', cursor: 'pointer' }}>
            <LogOut size={18} />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
        {/* Top Header Bar */}
        <header className="header-bar">
          <div className="header-title">
            <h1>{tenant.name} Suite</h1>
            <p>Offline-First SaaS Dashboard</p>
          </div>

          <div className="status-indicators">
            {/* Sync Queue Badge indicator */}
            {queueLength > 0 && (
              <button onClick={handleForceSync} className="badge badge-offline sync-queue-badge" style={{ cursor: 'pointer', border: '1px solid rgba(245,158,11,0.4)', background: 'rgba(245,158,11,0.1)' }}>
                <RefreshCw size={14} style={{ animation: 'spin-slow 6s linear infinite' }} />
                <span>{queueLength} Queue Pending</span>
              </button>
            )}

            {/* Offline status banner */}
            {isOnline ? (
              <span className="badge badge-online">
                <Wifi size={14} />
                <span>Online</span>
              </span>
            ) : (
              <span className="badge badge-offline">
                <WifiOff size={14} />
                <span>Offline Mode</span>
              </span>
            )}
          </div>
        </header>

        {/* Dynamic Tab Views */}

        {/* Tab 1: Dashboard */}
        {activeTab === 'dashboard' && (
          <div>
            <div className="stats-grid">
              <div className="card stat-card">
                <div className="stat-icon">
                  <Users size={24} />
                </div>
                <div className="stat-info">
                  <div className="stat-label">Active Members</div>
                  <div className="stat-value">{members.filter(m => m.status === 'Active').length}</div>
                </div>
              </div>

              <div className="card stat-card">
                <div className="stat-icon" style={{ backgroundColor: 'rgba(6, 182, 212, 0.1)', color: 'var(--accent-cyan)' }}>
                  <CheckCircle size={24} />
                </div>
                <div className="stat-info">
                  <div className="stat-label">Today's Check-ins</div>
                  <div className="stat-value">
                    {attendances.filter(a => {
                      const today = new Date().toDateString();
                      return new Date(a.checked_in_at).toDateString() === today;
                    }).length}
                  </div>
                </div>
              </div>

              <div className="card stat-card">
                <div className="stat-icon" style={{ backgroundColor: 'rgba(236, 72, 153, 0.1)', color: 'var(--accent-pink)' }}>
                  <CreditCard size={24} />
                </div>
                <div className="stat-info">
                  <div className="stat-label">Available Plans</div>
                  <div className="stat-value">{plans.filter(p => p.is_active).length}</div>
                </div>
              </div>

              <div className="card stat-card">
                <div className="stat-icon" style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', color: 'var(--status-offline)' }}>
                  <RefreshCw size={24} />
                </div>
                <div className="stat-info">
                  <div className="stat-label">Outbox Changes</div>
                  <div className="stat-value">{queueLength}</div>
                </div>
              </div>
            </div>

            {/* Quick Check-in search widget */}
            {hasPrivilege('attendance.mark') && (
              <div className="card" style={{ marginBottom: '40px', textAlign: 'left' }}>
                <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Clock size={20} style={{ color: 'var(--accent-purple)' }} />
                  <span>Front Desk Quick Check-in</span>
                </h2>
                <div className="form-group" style={{ position: 'relative', margin: 0 }}>
                  <label htmlFor="member-search-input" className="sr-only" style={{ display: 'none' }}>Search member by name or phone</label>
                  <Search size={18} style={{ position: 'absolute', left: '16px', top: '16px', color: 'var(--text-muted)' }} />
                  <input
                    id="member-search-input"
                    type="text"
                    className="form-input"
                    placeholder="Search member by name or phone number..."
                    style={{ paddingLeft: '48px', height: '50px' }}
                    value={checkinSearch}
                    onChange={e => setCheckinSearch(e.target.value)}
                  />

                  {filteredCheckinMembers.length > 0 && (
                    <div style={{
                      position: 'absolute',
                      top: '54px',
                      left: 0,
                      right: 0,
                      backgroundColor: 'var(--bg-secondary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '12px',
                      overflow: 'hidden',
                      zIndex: 10,
                      boxShadow: '0 10px 25px rgba(0,0,0,0.5)'
                    }}>
                      {filteredCheckinMembers.map(member => {
                        const plan = plans.find(p => p.id === member.membership_plan_id);
                        const isExpired = member.plan_expires_at ? new Date(member.plan_expires_at) < new Date() : false;

                        return (
                          <div key={member.id} style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '12px 20px',
                            borderBottom: '1px solid var(--border-color)',
                          }}>
                            <div>
                              <div style={{ fontWeight: '600' }}>{member.first_name} {member.last_name}</div>
                              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                Plan: {plan ? plan.name : 'No Plan'} {isExpired && <span style={{ color: 'var(--status-inactive)' }}>(Expired)</span>}
                              </div>
                            </div>
                            <button
                              onClick={() => handleCheckin(member.id)}
                              className="btn btn-primary"
                              style={{ padding: '6px 14px', borderRadius: '8px', fontSize: '13px' }}
                              disabled={member.status !== 'Active' || isExpired}
                            >
                              Check In
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Members */}
        {activeTab === 'members' && hasPrivilege('members.view') && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '20px', marginBottom: '24px' }}>
              <div style={{ position: 'relative', flex: 1, maxWidth: '400px' }}>
                <label htmlFor="member-filter-input" className="sr-only" style={{ display: 'none' }}>Filter members</label>
                <Search size={18} style={{ position: 'absolute', left: '16px', top: '14px', color: 'var(--text-muted)' }} />
                <input
                  id="member-filter-input"
                  type="text"
                  className="form-input"
                  placeholder="Filter members..."
                  style={{ paddingLeft: '48px' }}
                  value={memberSearch}
                  onChange={e => setMemberSearch(e.target.value)}
                />
              </div>

              {hasPrivilege('members.create') && (
                <button onClick={() => {
                  setEditingMember(null);
                  setMemberForm({
                    first_name: '',
                    last_name: '',
                    email: '',
                    phone: '',
                    status: 'Active',
                    membership_plan_id: plans[0]?.id || '',
                  });
                  setShowMemberModal(true);
                }} className="btn btn-primary">
                  <UserPlus size={18} />
                  <span>Register Member</span>
                </button>
              )}
            </div>

            <div className="table-container">
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Plan</th>
                    <th>Status</th>
                    <th>Expires At</th>
                    {hasPrivilege('members.create') && <th>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredMembers.length === 0 ? (
                    <tr>
                      <td colSpan={hasPrivilege('members.create') ? 7 : 6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px' }}>
                        No members found.
                      </td>
                    </tr>
                  ) : (
                    filteredMembers.map(member => {
                      const plan = plans.find(p => p.id === member.membership_plan_id);
                      return (
                        <tr key={member.id}>
                          <td style={{ fontWeight: '600' }}>{member.first_name} {member.last_name}</td>
                          <td>{member.email || '-'}</td>
                          <td>{member.phone || '-'}</td>
                          <td>{plan ? plan.name : 'No Plan'}</td>
                          <td>
                            <span className={`badge badge-${member.status.toLowerCase()}`}>
                              {member.status}
                            </span>
                          </td>
                          <td>
                            {member.plan_expires_at
                              ? new Date(member.plan_expires_at).toLocaleDateString()
                              : '-'}
                          </td>
                          {hasPrivilege('members.create') && (
                            <td>
                              <button onClick={() => {
                                setEditingMember(member);
                                setMemberForm({
                                  first_name: member.first_name,
                                  last_name: member.last_name,
                                  email: member.email || '',
                                  phone: member.phone || '',
                                  status: member.status,
                                  membership_plan_id: member.membership_plan_id || '',
                                });
                                setShowMemberModal(true);
                              }} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '13px', borderRadius: '8px' }}>
                                Edit
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 3: Plans */}
        {activeTab === 'plans' && hasPrivilege('plans.view') && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '24px' }}>
              {hasPrivilege('plans.manage') && (
                <button onClick={() => setShowPlanModal(true)} className="btn btn-primary">
                  <Plus size={18} />
                  <span>Create Plan</span>
                </button>
              )}
            </div>

            <div className="table-container">
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Plan Name</th>
                    <th>Price</th>
                    <th>Duration</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {plans.length === 0 ? (
                    <tr>
                      <td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px' }}>
                        No plans available.
                      </td>
                    </tr>
                  ) : (
                    plans.map(plan => (
                      <tr key={plan.id}>
                        <td style={{ fontWeight: '600' }}>{plan.name}</td>
                        <td>${plan.price}</td>
                        <td>{plan.duration_days} Days</td>
                        <td>
                          <span className={`badge badge-${plan.is_active ? 'active' : 'inactive'}`}>
                            {plan.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 4: Attendance History */}
        {activeTab === 'attendance' && hasPrivilege('attendance.view') && (
          <div>
            <div className="table-container">
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Checked In Member</th>
                    <th>Checked In At</th>
                  </tr>
                </thead>
                <tbody>
                  {attendances.length === 0 ? (
                    <tr>
                      <td colSpan={2} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px' }}>
                        No attendance logs recorded.
                      </td>
                    </tr>
                  ) : (
                    attendances.map(log => {
                      const member = members.find(m => m.id === log.member_id);
                      return (
                        <tr key={log.id}>
                          <td style={{ fontWeight: '600' }}>
                            {member ? `${member.first_name} ${member.last_name}` : 'Unknown Member'}
                          </td>
                          <td>{new Date(log.checked_in_at).toLocaleString()}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* Member Registration Modal */}
      {showMemberModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2 className="card-title">{editingMember ? 'Edit Member Profile' : 'Register New Member'}</h2>
            <form onSubmit={handleMemberSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label" htmlFor="member-first-name">First Name</label>
                  <input
                    id="member-first-name"
                    type="text"
                    className="form-input"
                    value={memberForm.first_name}
                    onChange={e => setMemberForm({ ...memberForm, first_name: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="member-last-name">Last Name</label>
                  <input
                    id="member-last-name"
                    type="text"
                    className="form-input"
                    value={memberForm.last_name}
                    onChange={e => setMemberForm({ ...memberForm, last_name: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="member-email">Email Address</label>
                <input
                  id="member-email"
                  type="email"
                  className="form-input"
                  value={memberForm.email}
                  onChange={e => setMemberForm({ ...memberForm, email: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="member-phone">Phone Number</label>
                <input
                  id="member-phone"
                  type="text"
                  className="form-input"
                  value={memberForm.phone}
                  onChange={e => setMemberForm({ ...memberForm, phone: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="member-status">Status</label>
                <select
                  id="member-status"
                  className="form-select"
                  value={memberForm.status}
                  onChange={e => setMemberForm({ ...memberForm, status: e.target.value })}
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                  <option value="Frozen">Frozen</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="member-plan">Membership Plan</label>
                <select
                  id="member-plan"
                  className="form-select"
                  value={memberForm.membership_plan_id}
                  onChange={e => setMemberForm({ ...memberForm, membership_plan_id: e.target.value })}
                >
                  <option value="">No Subscription Plan</option>
                  {plans.map(p => (
                    <option key={p.id} value={p.id}>{p.name} - ${p.price}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                <button type="button" onClick={() => {
                  setShowMemberModal(false);
                  setEditingMember(null);
                }} className="btn btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Member
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Membership Plan Creation Modal */}
      {showPlanModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2 className="card-title">Create Membership Plan</h2>
            <form onSubmit={handlePlanSubmit}>
              <div className="form-group">
                <label className="form-label" htmlFor="plan-name">Plan Name</label>
                <input
                  id="plan-name"
                  type="text"
                  className="form-input"
                  placeholder="e.g. Monthly Standard"
                  value={planForm.name}
                  onChange={e => setPlanForm({ ...planForm, name: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="plan-price">Price ($)</label>
                <input
                  id="plan-price"
                  type="number"
                  step="0.01"
                  className="form-input"
                  placeholder="e.g. 29.99"
                  value={planForm.price}
                  onChange={e => setPlanForm({ ...planForm, price: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="plan-duration">Duration (Days)</label>
                <input
                  id="plan-duration"
                  type="number"
                  className="form-input"
                  placeholder="30"
                  value={planForm.duration_days}
                  onChange={e => setPlanForm({ ...planForm, duration_days: e.target.value })}
                  required
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                <button type="button" onClick={() => setShowPlanModal(false)} className="btn btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Create Plan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Floating Status Notification Toast */}
      {toast && (
        <div className={`toast toast-${toast.type}`}>
          {toast.type === 'error' && <AlertTriangle size={18} style={{ color: 'var(--status-inactive)' }} />}
          {toast.type === 'success' && <CheckCircle size={18} style={{ color: 'var(--status-active)' }} />}
          {toast.type === 'warning' && <AlertTriangle size={18} style={{ color: 'var(--status-offline)' }} />}
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
}
