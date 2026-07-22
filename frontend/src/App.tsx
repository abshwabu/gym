import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  Users, Activity, CreditCard, Clock, LogOut, CheckCircle, 
  XCircle, RefreshCw, Plus, Search, UserPlus, Info
} from 'lucide-react';
import { db } from './db/gymDb';
import { SyncManager } from './sync/syncManager';

// --- AUTHENTICATION GUARD ---
const AuthGuard = ({ children }: { children: React.ReactNode }) => {
  const token = localStorage.getItem('gym_auth_token');
  const location = useLocation();

  if (!token) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [token, setToken] = useState<string | null>(localStorage.getItem('gym_auth_token'));
  const [tenantSlug, setTenantSlug] = useState<string>(localStorage.getItem('tenant_slug') || '');
  const [privileges, setPrivileges] = useState<string[]>(JSON.parse(localStorage.getItem('user_privileges') || '[]'));
  const [roles, setRoles] = useState<string[]>(JSON.parse(localStorage.getItem('user_roles') || '[]'));
  const [user, setUser] = useState<any>(JSON.parse(localStorage.getItem('user_info') || 'null'));

  // Connectivity indicators
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const queueLength = useLiveQuery(() => db.outbox.where('status').equals('pending').count()) || 0;

  // Form states
  const [loginForm, setLoginForm] = useState({ email: '', password: '', tenant_slug: '' });
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // App UI states
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);
  
  // Members modal form
  const [showMemberModal, setShowMemberModal] = useState(false);
  const [editingMember, setEditingMember] = useState<any>(null);
  const [memberForm, setMemberForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    status: 'Active',
    membership_plan_id: '',
  });

  // Plans modal form
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [planForm, setPlanForm] = useState({
    name: '',
    billing_cycle: 'monthly',
    custom_cycle_days: '',
    price: '',
    session_limit: '',
    freeze_allowance_days: '0',
    is_active: true,
  });

  // Search states
  const [checkinSearch, setCheckinSearch] = useState('');
  const [memberSearch, setMemberSearch] = useState('');

  // Toast helper
  const showToast = (message: string, type: 'success' | 'error' | 'warning' = 'success') => {
    setToast({ message, type });
  };

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Monitor network status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      showToast('Connection restored. Syncing offline changes...', 'success');
      if (token) {
        setIsSyncing(true);
        SyncManager.syncNow(token)
          .then(() => queryClient.invalidateQueries())
          .finally(() => setIsSyncing(false));
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      showToast('Working offline. Actions will be queued.', 'warning');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    if (token) {
      SyncManager.startSyncCycle(token);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      SyncManager.stopSyncCycle();
    };
  }, [token, queryClient]);

  // Force a manual outbox synchronization
  const triggerManualSync = async () => {
    if (!token || isSyncing || !isOnline) return;
    setIsSyncing(true);
    showToast('Synchronizing changes...', 'warning');
    try {
      await SyncManager.syncNow(token);
      await queryClient.invalidateQueries();
      showToast('Sync completed successfully.');
    } catch (e) {
      showToast('Sync failed.', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  // --- TANSTACK CUSTOM QUERY LOGIC (Reads Dexie, Pulls from Server if Online) ---
  const { data: members = [] } = useQuery({
    queryKey: ['members', token],
    queryFn: async () => {
      const local = await db.cache_members.toArray();
      if (isOnline && token) {
        try {
          await SyncManager.pullFreshCaches(token);
          return await db.cache_members.toArray();
        } catch (e) {
          return local;
        }
      }
      return local;
    },
    enabled: !!token,
  });

  const { data: plans = [] } = useQuery({
    queryKey: ['plans', token],
    queryFn: async () => {
      const local = await db.cache_plans.toArray();
      if (isOnline && token) {
        try {
          await SyncManager.pullFreshCaches(token);
          return await db.cache_plans.toArray();
        } catch (e) {
          return local;
        }
      }
      return local;
    },
    enabled: !!token,
  });

  const { data: attendances = [] } = useQuery({
    queryKey: ['attendances', token],
    queryFn: async () => {
      const local = await db.cache_attendances.toArray();
      if (isOnline && token) {
        try {
          await SyncManager.pullFreshCaches(token);
          const fresh = await db.cache_attendances.toArray();
          return fresh.sort((a, b) => new Date(b.checked_in_at).getTime() - new Date(a.checked_in_at).getTime());
        } catch (e) {
          return local;
        }
      }
      return local.sort((a, b) => new Date(b.checked_in_at).getTime() - new Date(a.checked_in_at).getTime());
    },
    enabled: !!token,
  });

  const hasPrivilege = (priv: string) => privileges.includes(priv);

  // Authenticate login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setIsLoggingIn(true);

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(loginForm),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Authentication failed.');
      }

      const data = await response.json();
      
      // Save credentials in client storage
      localStorage.setItem('gym_auth_token', data.token);
      localStorage.setItem('tenant_slug', data.tenant.slug);
      localStorage.setItem('user_privileges', JSON.stringify(data.privileges));
      localStorage.setItem('user_roles', JSON.stringify(data.roles));
      localStorage.setItem('user_info', JSON.stringify(data.user));

      setToken(data.token);
      setTenantSlug(data.tenant.slug);
      setPrivileges(data.privileges);
      setRoles(data.roles);
      setUser(data.user);

      showToast(`Welcome back, ${data.user.name}!`);
      navigate('/');
    } catch (err: any) {
      setLoginError(err.message || 'Invalid credentials or connection lost.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Terminate Session
  const handleLogout = async () => {
    if (token) {
      try {
        await fetch('/api/logout', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json',
          },
        });
      } catch (e) {
        // Silent catch for offline logouts
      }
    }

    localStorage.clear();
    setToken(null);
    setTenantSlug('');
    setPrivileges([]);
    setRoles([]);
    setUser(null);
    queryClient.clear();
    navigate('/login');
  };

  // Log Check-in (Optimistic UI)
  const handleCheckin = async (memberId: string) => {
    const member = members.find((m: any) => m.id === memberId);
    if (!member) return;

    if (member.status !== 'Active') {
      showToast(`Cannot check in: Member status is "${member.status}"`, 'error');
      return;
    }

    const attendanceId = crypto.randomUUID();
    const checked_in_at = new Date().toISOString();
    const payload = {
      id: attendanceId,
      member_id: memberId,
      checked_in_at,
      method: 'kiosk',
    };

    try {
      await SyncManager.queueWrite('attendances', 'create', attendanceId, payload);
      queryClient.invalidateQueries({ queryKey: ['attendances'] });
      showToast(`Successfully checked in ${member.first_name}!`);
      setCheckinSearch('');
    } catch (e) {
      showToast('Error recording check-in.', 'error');
    }
  };

  // Upsert Member
  const handleMemberSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const memberId = editingMember ? editingMember.id : crypto.randomUUID();
    const action = editingMember ? 'update' : 'create';

    const payload = {
      first_name: memberForm.first_name,
      last_name: memberForm.last_name,
      email: memberForm.email || null,
      phone: memberForm.phone || null,
      status: memberForm.status,
    };

    try {
      await SyncManager.queueWrite('members', action, memberId, payload);
      queryClient.invalidateQueries({ queryKey: ['members'] });
      showToast(editingMember ? 'Member profile updated.' : 'Member registered successfully.');
      setShowMemberModal(false);
      setEditingMember(null);
      setMemberForm({ first_name: '', last_name: '', email: '', phone: '', status: 'Active', membership_plan_id: '' });
    } catch (e) {
      showToast('Error saving member.', 'error');
    }
  };

  // Upsert Plan
  const handlePlanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const planId = crypto.randomUUID();

    const payload = {
      name: planForm.name,
      billing_cycle: planForm.billing_cycle,
      custom_cycle_days: planForm.billing_cycle === 'custom_days' ? parseInt(planForm.custom_cycle_days) : null,
      price: parseFloat(planForm.price),
      currency: 'USD',
      session_limit: planForm.session_limit ? parseInt(planForm.session_limit) : null,
      freeze_allowance_days: parseInt(planForm.freeze_allowance_days),
      is_active: planForm.is_active,
    };

    try {
      await SyncManager.queueWrite('plans', 'create', planId, payload);
      queryClient.invalidateQueries({ queryKey: ['plans'] });
      showToast(`Plan "${planForm.name}" created.`);
      setShowPlanModal(false);
      setPlanForm({ name: '', billing_cycle: 'monthly', custom_cycle_days: '', price: '', session_limit: '', freeze_allowance_days: '0', is_active: true });
    } catch (e) {
      showToast('Error creating plan.', 'error');
    }
  };

  // Filter members list by search keyword
  const filteredMembers = members.filter((m: any) => {
    const full = `${m.first_name} ${m.last_name}`.toLowerCase();
    return full.includes(memberSearch.toLowerCase()) || 
           (m.phone && m.phone.includes(memberSearch)) || 
           (m.email && m.email.toLowerCase().includes(memberSearch.toLowerCase()));
  });

  const filteredCheckinMembers = checkinSearch.trim() === ''
    ? []
    : members.filter((m: any) => {
        const full = `${m.first_name} ${m.last_name}`.toLowerCase();
        return m.status === 'Active' && (full.includes(checkinSearch.toLowerCase()) || (m.phone && m.phone.includes(checkinSearch)));
      }).slice(0, 5);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      {/* Toast Alert popup */}
      {toast && (
        <div className={`toast toast-${toast.type}`}>
          {toast.type === 'success' && <CheckCircle size={18} />}
          {toast.type === 'error' && <XCircle size={18} />}
          {toast.type === 'warning' && <Info size={18} />}
          <span>{toast.message}</span>
        </div>
      )}

      <Routes>
        {/* Restrictive login route */}
        <Route path="/login" element={
          token ? <Navigate to="/" replace /> : (
            <div className="login-container">
              <div className="login-card">
                <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                  <div style={{ display: 'inline-flex', padding: '12px', borderRadius: '16px', backgroundColor: 'rgba(168, 85, 247, 0.1)', color: 'var(--accent-purple)', marginBottom: '16px' }}>
                    <Activity size={36} />
                  </div>
                  <h1 style={{ fontSize: '28px', fontWeight: '800', letterSpacing: '-0.025em', color: 'var(--text-primary)' }}>Sign In to APEX</h1>
                  <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '8px' }}>Gym Management Portal</p>
                </div>

                {loginError && (
                  <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: 'var(--status-offline)', padding: '12px 16px', borderRadius: '10px', fontSize: '13px', marginBottom: '20px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <XCircle size={16} />
                    <span>{loginError}</span>
                  </div>
                )}

                <form onSubmit={handleLogin}>
                  <div className="form-group">
                    <label className="form-label" htmlFor="tenant">Gym Code (Tenant Slug)</label>
                    <input
                      id="tenant"
                      type="text"
                      className="form-input"
                      required
                      placeholder="e.g. apex"
                      value={loginForm.tenant_slug}
                      onChange={e => setLoginForm({ ...loginForm, tenant_slug: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="email">Email Address</label>
                    <input
                      id="email"
                      type="email"
                      className="form-input"
                      required
                      placeholder="name@gym.com"
                      value={loginForm.email}
                      onChange={e => setLoginForm({ ...loginForm, email: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="password">Password</label>
                    <input
                      id="password"
                      type="password"
                      className="form-input"
                      required
                      placeholder="••••••••"
                      value={loginForm.password}
                      onChange={e => setLoginForm({ ...loginForm, password: e.target.value })}
                    />
                  </div>

                  <button type="submit" disabled={isLoggingIn} className="btn btn-primary" style={{ width: '100%', height: '46px', marginTop: '16px' }}>
                    {isLoggingIn ? 'Authenticating...' : 'Sign In'}
                  </button>
                </form>
              </div>
            </div>
          )
        } />

        {/* Protected route tree */}
        <Route path="/*" element={
          <AuthGuard>
            <div className="app-container">
              {/* Sidebar layout */}
              <aside className="sidebar">
                <div className="sidebar-logo">
                  <Activity size={24} style={{ color: 'var(--accent-purple)' }} />
                  <span>A P E X</span>
                </div>

                <nav className="sidebar-nav">
                  <button onClick={() => navigate('/')} className={`sidebar-link ${location.pathname === '/' ? 'active' : ''}`}>
                    <Activity size={18} />
                    <span>Dashboard</span>
                  </button>

                  {hasPrivilege('members.view') && (
                    <button onClick={() => navigate('/members')} className={`sidebar-link ${location.pathname === '/members' ? 'active' : ''}`}>
                      <Users size={18} />
                      <span>Members</span>
                    </button>
                  )}

                  {hasPrivilege('plans.view') && (
                    <button onClick={() => navigate('/plans')} className={`sidebar-link ${location.pathname === '/plans' ? 'active' : ''}`}>
                      <CreditCard size={18} />
                      <span>Membership Plans</span>
                    </button>
                  )}

                  {hasPrivilege('attendance.view') && (
                    <button onClick={() => navigate('/attendance')} className={`sidebar-link ${location.pathname === '/attendance' ? 'active' : ''}`}>
                      <Clock size={18} />
                      <span>Check-ins</span>
                    </button>
                  )}
                </nav>

                <div className="sidebar-footer">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: 'var(--accent-purple)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 'bold' }}>
                      {user ? user.name[0].toUpperCase() : 'U'}
                    </div>
                    <div style={{ overflow: 'hidden' }}>
                      <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{user ? user.name : 'Staff User'}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{roles[0] || 'Staff'}</div>
                    </div>
                  </div>
                  <button onClick={handleLogout} className="sidebar-link" style={{ width: '100%', color: 'var(--status-offline)' }}>
                    <LogOut size={16} />
                    <span>Sign Out</span>
                  </button>
                </div>
              </aside>

              {/* Main content viewport */}
              <div className="main-content">
                {/* Header navbar */}
                <header className="top-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="badge badge-active" style={{ textTransform: 'uppercase' }}>{tenantSlug} Gym</span>
                  </div>

                  {/* SMALL CONNECTIVITY INDICATOR */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div 
                      onClick={triggerManualSync}
                      style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: isOnline && queueLength > 0 ? 'pointer' : 'default', padding: '6px 12px', borderRadius: '8px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}
                    >
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: isOnline ? 'var(--status-online)' : 'var(--status-offline)' }}></span>
                      <span>{isOnline ? 'Online' : 'Offline'}</span>
                      {queueLength > 0 && (
                        <span style={{ fontSize: '11px', backgroundColor: 'var(--accent-purple)', color: 'white', padding: '1px 6px', borderRadius: '10px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <RefreshCw size={10} className={isSyncing ? 'spin' : ''} />
                          {queueLength} pending
                        </span>
                      )}
                    </div>
                  </div>
                </header>

                <div className="content-body">
                  <Routes>
                    {/* Dashboard view */}
                    <Route path="/" element={
                      <div>
                        <div className="stats-grid">
                          <div className="card stat-card">
                            <div className="stat-icon">
                              <Users size={24} />
                            </div>
                            <div className="stat-info">
                              <div className="stat-label">Active Members</div>
                              <div className="stat-value">{members.filter((m: any) => m.status === 'Active').length}</div>
                            </div>
                          </div>

                          <div className="card stat-card">
                            <div className="stat-icon" style={{ backgroundColor: 'rgba(6, 182, 212, 0.1)', color: 'var(--accent-cyan)' }}>
                              <CheckCircle size={24} />
                            </div>
                            <div className="stat-info">
                              <div className="stat-label">Today's Check-ins</div>
                              <div className="stat-value">
                                {attendances.filter((a: any) => {
                                  return new Date(a.checked_in_at).toDateString() === new Date().toDateString();
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
                              <div className="stat-value">{plans.filter((p: any) => p.is_active).length}</div>
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

                        {/* Front Desk checkin scan widget */}
                        {hasPrivilege('attendance.mark') && (
                          <div className="card" style={{ marginBottom: '40px', textAlign: 'left' }}>
                            <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <Clock size={20} style={{ color: 'var(--accent-purple)' }} />
                              <span>Front Desk Quick Check-in</span>
                            </h2>
                            <div className="form-group" style={{ position: 'relative', margin: 0 }}>
                              <Search size={18} style={{ position: 'absolute', left: '16px', top: '16px', color: 'var(--text-muted)' }} />
                              <input
                                type="text"
                                className="form-input"
                                placeholder="Search member by name or phone..."
                                style={{ paddingLeft: '48px', height: '50px' }}
                                value={checkinSearch}
                                onChange={e => setCheckinSearch(e.target.value)}
                              />

                              {filteredCheckinMembers.length > 0 && (
                                <div style={{ position: 'absolute', top: '54px', left: 0, right: 0, backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '12px', overflow: 'hidden', zIndex: 10, boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}>
                                  {filteredCheckinMembers.map((member: any) => (
                                    <div key={member.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', borderBottom: '1px solid var(--border-color)' }}>
                                      <div>
                                        <div style={{ fontWeight: '600' }}>{member.first_name} {member.last_name}</div>
                                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{member.phone || 'No Phone'}</div>
                                      </div>
                                      <button onClick={() => handleCheckin(member.id)} className="btn btn-primary" style={{ padding: '6px 16px', fontSize: '13px', borderRadius: '8px' }}>
                                        Check In
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    } />

                    {/* Members List view */}
                    <Route path="/members" element={
                      hasPrivilege('members.view') ? (
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
                            <div style={{ position: 'relative', width: '300px' }}>
                              <Search size={18} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-muted)' }} />
                              <input
                                type="text"
                                className="form-input"
                                placeholder="Search members..."
                                style={{ paddingLeft: '38px', height: '40px' }}
                                value={memberSearch}
                                onChange={e => setMemberSearch(e.target.value)}
                              />
                            </div>
                            {hasPrivilege('members.create') && (
                              <button onClick={() => {
                                setEditingMember(null);
                                setMemberForm({ first_name: '', last_name: '', email: '', phone: '', status: 'Active', membership_plan_id: '' });
                                setShowMemberModal(true);
                              }} className="btn btn-primary">
                                <UserPlus size={18} />
                                <span>Add Member</span>
                              </button>
                            )}
                          </div>

                          <div className="table-container">
                            <table className="custom-table">
                              <thead>
                                <tr>
                                  <th>Member</th>
                                  <th>Email</th>
                                  <th>Phone</th>
                                  <th>Status</th>
                                  {hasPrivilege('members.create') && <th>Actions</th>}
                                </tr>
                              </thead>
                              <tbody>
                                {filteredMembers.length === 0 ? (
                                  <tr>
                                    <td colSpan={hasPrivilege('members.create') ? 5 : 4} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px' }}>
                                      No members found.
                                    </td>
                                  </tr>
                                ) : (
                                  filteredMembers.map((member: any) => (
                                    <tr key={member.id}>
                                      <td style={{ fontWeight: '600' }}>{member.first_name} {member.last_name}</td>
                                      <td>{member.email || '-'}</td>
                                      <td>{member.phone || '-'}</td>
                                      <td>
                                        <span className={`badge badge-${member.status.toLowerCase()}`}>
                                          {member.status}
                                        </span>
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
                                              membership_plan_id: '',
                                            });
                                            setShowMemberModal(true);
                                          }} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '13px', borderRadius: '8px' }}>
                                            Edit
                                          </button>
                                        </td>
                                      )}
                                    </tr>
                                  ))
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ) : <Navigate to="/" replace />
                    } />

                    {/* Plans List view */}
                    <Route path="/plans" element={
                      hasPrivilege('plans.view') ? (
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '24px' }}>
                            {hasPrivilege('plans.create') && (
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
                                  <th>Billing Cycle</th>
                                  <th>Price</th>
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
                                  plans.map((plan: any) => (
                                    <tr key={plan.id}>
                                      <td style={{ fontWeight: '600' }}>{plan.name}</td>
                                      <td style={{ textTransform: 'capitalize' }}>
                                        {plan.billing_cycle === 'custom_days' ? `${plan.custom_cycle_days} Days` : plan.billing_cycle}
                                      </td>
                                      <td>${plan.price}</td>
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
                      ) : <Navigate to="/" replace />
                    } />

                    {/* Attendance Logs view */}
                    <Route path="/attendance" element={
                      hasPrivilege('attendance.view') ? (
                        <div>
                          <div className="table-container">
                            <table className="custom-table">
                              <thead>
                                <tr>
                                  <th>Member</th>
                                  <th>Method</th>
                                  <th>Checked In At</th>
                                </tr>
                              </thead>
                              <tbody>
                                {attendances.length === 0 ? (
                                  <tr>
                                    <td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px' }}>
                                      No check-in logs recorded.
                                    </td>
                                  </tr>
                                ) : (
                                  attendances.map((log: any) => {
                                    const member = members.find((m: any) => m.id === log.member_id);
                                    return (
                                      <tr key={log.id}>
                                        <td style={{ fontWeight: '600' }}>
                                          {member ? `${member.first_name} ${member.last_name}` : 'Unknown Member'}
                                        </td>
                                        <td style={{ textTransform: 'uppercase', fontSize: '11px' }}>{log.method || 'Kiosk'}</td>
                                        <td>{new Date(log.checked_in_at).toLocaleString()}</td>
                                      </tr>
                                    );
                                  })
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ) : <Navigate to="/" replace />
                    } />

                    {/* Catch-all fallback */}
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </div>
              </div>
            </div>

            {/* Members Creation Modal */}
            {showMemberModal && (
              <div className="modal-overlay">
                <div className="modal-card">
                  <h3 className="modal-title">{editingMember ? 'Edit Member Profile' : 'Register New Member'}</h3>
                  <form onSubmit={handleMemberSubmit}>
                    <div className="form-group">
                      <label className="form-label" htmlFor="first-name">First Name</label>
                      <input id="first-name" type="text" className="form-input" required value={memberForm.first_name} onChange={e => setMemberForm({ ...memberForm, first_name: e.target.value })} />
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="last-name">Last Name</label>
                      <input id="last-name" type="text" className="form-input" required value={memberForm.last_name} onChange={e => setMemberForm({ ...memberForm, last_name: e.target.value })} />
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="email-addr">Email address</label>
                      <input id="email-addr" type="email" className="form-input" value={memberForm.email} onChange={e => setMemberForm({ ...memberForm, email: e.target.value })} />
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="phone-num">Phone Number</label>
                      <input id="phone-num" type="text" className="form-input" value={memberForm.phone} onChange={e => setMemberForm({ ...memberForm, phone: e.target.value })} />
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="member-status">Member Status</label>
                      <select id="member-status" className="form-select" value={memberForm.status} onChange={e => setMemberForm({ ...memberForm, status: e.target.value })}>
                        <option value="Active">Active</option>
                        <option value="Inactive">Inactive</option>
                        <option value="Frozen">Frozen</option>
                      </select>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                      <button type="button" onClick={() => { setShowMemberModal(false); setEditingMember(null); }} className="btn btn-secondary">Cancel</button>
                      <button type="submit" className="btn btn-primary">Save Member</button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* Plans Creation Modal */}
            {showPlanModal && (
              <div className="modal-overlay">
                <div className="modal-card">
                  <h3 className="modal-title">Create Membership Plan</h3>
                  <form onSubmit={handlePlanSubmit}>
                    <div className="form-group">
                      <label className="form-label" htmlFor="plan-name">Plan Name</label>
                      <input id="plan-name" type="text" className="form-input" required value={planForm.name} onChange={e => setPlanForm({ ...planForm, name: e.target.value })} />
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="billing-cycle">Billing Cycle</label>
                      <select id="billing-cycle" className="form-select" value={planForm.billing_cycle} onChange={e => setPlanForm({ ...planForm, billing_cycle: e.target.value })}>
                        <option value="one_time">One Time</option>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                        <option value="quarterly">Quarterly</option>
                        <option value="annual">Annual</option>
                        <option value="custom_days">Custom Days</option>
                      </select>
                    </div>
                    {planForm.billing_cycle === 'custom_days' && (
                      <div className="form-group">
                        <label className="form-label" htmlFor="cycle-days">Number of Days</label>
                        <input id="cycle-days" type="number" className="form-input" required min="1" value={planForm.custom_cycle_days} onChange={e => setPlanForm({ ...planForm, custom_cycle_days: e.target.value })} />
                      </div>
                    )}
                    <div className="form-group">
                      <label className="form-label" htmlFor="plan-price">Price ($)</label>
                      <input id="plan-price" type="number" step="0.01" min="0" className="form-input" required value={planForm.price} onChange={e => setPlanForm({ ...planForm, price: e.target.value })} />
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="session-limit">Session Limit (Visits)</label>
                      <input id="session-limit" type="number" placeholder="Unlimited" className="form-input" value={planForm.session_limit} onChange={e => setPlanForm({ ...planForm, session_limit: e.target.value })} />
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="freeze-days">Freeze Allowance (Days)</label>
                      <input id="freeze-days" type="number" min="0" className="form-input" value={planForm.freeze_allowance_days} onChange={e => setPlanForm({ ...planForm, freeze_allowance_days: e.target.value })} />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                      <button type="button" onClick={() => setShowPlanModal(false)} className="btn btn-secondary">Cancel</button>
                      <button type="submit" className="btn btn-primary">Create Plan</button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </AuthGuard>
        } />
      </Routes>
    </div>
  );
}
