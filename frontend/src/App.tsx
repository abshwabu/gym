import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  Users, Activity, CreditCard, Clock, LogOut, CheckCircle, 
  XCircle, RefreshCw, Plus, Search, UserPlus, Info, Shield, Key, User,
  AlertTriangle, DollarSign, Briefcase
} from 'lucide-react';
import { db } from './db/gymDb';
import { SyncManager } from './sync/syncManager';
import { 
  PlatformTenants, PlatformTenantDetails, 
  PlatformSubscriptionPlans, PlatformImpersonationLogs 
} from './components/PlatformComponents';
import { FinanceDashboard, HRDashboard } from './components/FinanceAndHRComponents';

// --- DUMMY/BUNDLED VERIFIABLE LICENSE PUBLIC KEY ---
const LICENSE_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA0G9a98...
-----END PUBLIC KEY-----`;

// --- OFFLINE LICENSE VALIDATION CHECKER ---
const checkLicenseOffline = (): { valid: boolean; message: string } => {
  const userInfoStr = localStorage.getItem('user_info');
  if (userInfoStr) {
    const user = JSON.parse(userInfoStr);
    if (user.is_super_admin) {
      return { valid: true, message: 'Super admin' };
    }
  }

  // Impersonating sessions bypass validation checks
  if (localStorage.getItem('is_impersonating') === 'true') {
    return { valid: true, message: 'Impersonation active' };
  }

  const token = localStorage.getItem('license_token');
  if (!token) {
    return { valid: false, message: 'No license token found. Please connect to the internet to activate.' };
  }

  try {
    // Assert signature verification keys are loaded
    if (!LICENSE_PUBLIC_KEY) {
      return { valid: false, message: 'License key signature configuration is missing.' };
    }

    const parts = token.split('.');
    if (parts.length !== 3) {
      return { valid: false, message: 'Invalid license signature configuration.' };
    }
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    
    // Check expiration against current system time (device clock)
    // NOTE: System-clock rollback is a known limitation of offline enforcement.
    if (new Date(payload.expires_at) < new Date()) {
      return { valid: false, message: 'License validity period expired. Please connect to the internet to renew.' };
    }
    
    return { valid: true, message: 'Valid' };
  } catch (e) {
    return { valid: false, message: 'Failed to parse license verification token.' };
  }
};

// --- LOCK SCREEN OVERLAY FOR EXPIRED LICENSES ---
const LicenseLockScreen = ({ message }: { message: string }) => {
  const [key, setKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!key.trim()) return;
    setLoading(true);
    setErrorMsg('');

    try {
      const authToken = localStorage.getItem('gym_auth_token');
      const response = await fetch('/api/license/activate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ license_key: key.trim() })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Activation failed.');
      }

      localStorage.setItem('license_token', data.token);
      alert('License activated successfully! Access restored.');
      window.location.reload();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to activate license key.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      width: '100vw',
      backgroundColor: '#0f172a',
      color: '#f8fafc',
      textAlign: 'center',
      padding: '24px'
    }}>
      <div style={{
        backgroundColor: '#1e293b',
        padding: '40px',
        borderRadius: '16px',
        boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
        maxWidth: '500px',
        border: '2px solid #ef4444'
      }}>
        <AlertTriangle size={48} style={{ color: '#ef4444', marginBottom: '16px' }} />
        <h2 style={{ color: '#f1f5f9', fontSize: '22px', fontWeight: 'bold', marginBottom: '12px' }}>License Verification Locked</h2>
        <p style={{ fontSize: '15px', color: '#94a3b8', lineHeight: '1.6', marginBottom: '24px' }}>
          {message}
        </p>

        <form onSubmit={handleActivate} style={{ marginBottom: '24px', textAlign: 'left' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#94a3b8', marginBottom: '8px' }}>
            Enter License Activation Key
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              value={key}
              onChange={(e) => setKey(e.target.value.toUpperCase())}
              placeholder="GYM-XXXX-XXXX-XXXX"
              required
              disabled={loading}
              style={{
                flex: 1,
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid #475569',
                backgroundColor: '#0f172a',
                color: '#f8fafc',
                fontSize: '14px',
                outline: 'none',
                transition: 'border-color 0.2s'
              }}
              onFocus={(e) => e.target.style.borderColor = '#6366f1'}
              onBlur={(e) => e.target.style.borderColor = '#475569'}
            />
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: '10px 20px',
                borderRadius: '8px',
                backgroundColor: '#6366f1',
                color: '#ffffff',
                fontWeight: '600',
                border: 'none',
                cursor: 'pointer',
                fontSize: '14px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                opacity: loading ? 0.7 : 1
              }}
            >
              {loading ? 'Activating...' : 'Activate'}
            </button>
          </div>
          {errorMsg && (
            <p style={{ color: '#f87171', fontSize: '13px', marginTop: '8px', fontWeight: '500' }}>
              {errorMsg}
            </p>
          )}
        </form>

        <p style={{ fontSize: '13px', color: '#64748b' }}>
          Reconnect this terminal device to the internet to sync and auto-renew the validation lease, or contact your provider support.
        </p>
      </div>
    </div>
  );
};

// --- AUTHENTICATION GUARD ---
const AuthGuard = ({ children }: { children: React.ReactNode }) => {
  const token = localStorage.getItem('gym_auth_token');
  const location = useLocation();

  if (!token) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const licenseCheck = checkLicenseOffline();
  if (!licenseCheck.valid) {
    return <LicenseLockScreen message={licenseCheck.message} />;
  }

  return <>{children}</>;
};

// --- IMPERSONATION AUDIT BANNER ---
const ImpersonationBanner = () => {
  const [elapsed, setElapsed] = useState(0);
  const tenantName = localStorage.getItem('impersonation_tenant_name') || 'Gym';
  const logId = localStorage.getItem('impersonation_log_id');

  useEffect(() => {
    const start = Date.now();
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleEndImpersonation = async () => {
    const superAdminToken = localStorage.getItem('super_admin_token');
    if (!superAdminToken) return;

    try {
      await fetch('/api/platform/impersonate/end', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${superAdminToken}`
        },
        body: JSON.stringify({ impersonation_log_id: logId })
      });
    } catch (e) {
      console.error(e);
    }

    localStorage.setItem('gym_auth_token', superAdminToken);
    localStorage.removeItem('super_admin_token');
    localStorage.removeItem('is_impersonating');
    localStorage.removeItem('impersonation_tenant_name');
    localStorage.removeItem('impersonation_log_id');

    window.location.href = '/platform/tenants';
  };

  return (
    <div style={{
      backgroundColor: '#f59e0b',
      color: '#0f172a',
      padding: '8px 16px',
      fontSize: '13px',
      fontWeight: 'bold',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      zIndex: 1000,
      position: 'sticky',
      top: 0,
      width: '100%',
      boxShadow: '0 2px 10px rgba(0,0,0,0.2)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Shield size={16} />
        <span>Impersonating {tenantName} &mdash; Duration: {formatTime(elapsed)}</span>
      </div>
      <button 
        onClick={handleEndImpersonation} 
        style={{
          backgroundColor: '#0f172a',
          color: '#f8fafc',
          border: 'none',
          padding: '4px 12px',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '11px',
          fontWeight: 'bold'
        }}
      >
        End Impersonation
      </button>
    </div>
  );
};

// --- SUPER ADMIN LAYOUT ---
const SuperAdminLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const user = JSON.parse(localStorage.getItem('user_info') || '{}');

  const handleLogout = async () => {
    localStorage.removeItem('gym_auth_token');
    localStorage.removeItem('user_info');
    localStorage.removeItem('user_privileges');
    localStorage.removeItem('user_roles');
    localStorage.removeItem('tenant_slug');
    window.location.href = '/login';
  };

  return (
    <div className="app-container platform-theme" style={{ minHeight: '100vh' }}>
      <aside className="sidebar" style={{ borderRight: '1px solid var(--border-color)' }}>
        <div className="sidebar-logo">
          <Activity size={24} style={{ color: 'var(--accent-cyan)' }} />
          <span style={{ color: 'var(--accent-cyan)', fontWeight: 'bold' }}>PLATFORM</span>
        </div>

        <nav className="sidebar-nav">
          <button onClick={() => navigate('/platform/tenants')} className={`sidebar-link ${location.pathname.startsWith('/platform/tenants') ? 'active' : ''}`}>
            <Users size={18} />
            <span>Gym Tenants</span>
          </button>

          <button onClick={() => navigate('/platform/subscription-plans')} className={`sidebar-link ${location.pathname.startsWith('/platform/subscription-plans') ? 'active' : ''}`}>
            <CreditCard size={18} />
            <span>Platform Plans</span>
          </button>

          <button onClick={() => navigate('/platform/impersonation-logs')} className={`sidebar-link ${location.pathname.startsWith('/platform/impersonation-logs') ? 'active' : ''}`}>
            <Shield size={18} />
            <span>Impersonation Logs</span>
          </button>
        </nav>

        <div className="sidebar-footer">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 'bold', color: '#000' }}>
              {user.name ? user.name[0].toUpperCase() : 'A'}
            </div>
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{user.name || 'Platform Admin'}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Super Admin</div>
            </div>
          </div>
          <button onClick={handleLogout} className="sidebar-link" style={{ width: '100%', color: 'var(--status-offline)' }}>
            <LogOut size={16} />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      <div className="main-content" style={{ display: 'flex', flexDirection: 'column' }}>
        <header className="top-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="badge" style={{ textTransform: 'uppercase', backgroundColor: 'var(--accent-cyan)', color: '#000', fontWeight: 'bold' }}>Platform Super Admin</span>
          </div>
        </header>

        <div className="content-body" style={{ padding: '32px', flex: 1 }}>
          <Routes>
            <Route path="platform/tenants" element={<PlatformTenants />} />
            <Route path="platform/tenants/:tenantId" element={<PlatformTenantDetails />} />
            <Route path="platform/subscription-plans" element={<PlatformSubscriptionPlans />} />
            <Route path="platform/impersonation-logs" element={<PlatformImpersonationLogs />} />
            <Route path="*" element={<Navigate to="/platform/tenants" replace />} />
          </Routes>
        </div>
      </div>
    </div>
  );
};

// --- REUSABLE PRIVILEGE CHECK WRAPPER ---
export const RequirePrivilege = ({ 
  privilege, 
  children, 
  fallback = null 
}: { 
  privilege: string; 
  children: React.ReactNode; 
  fallback?: React.ReactNode 
}) => {
  const privileges: string[] = JSON.parse(localStorage.getItem('user_privileges') || '[]');
  const roles: string[] = JSON.parse(localStorage.getItem('user_roles') || '[]');
  const isOwner = roles.includes('Owner') || roles.includes('Admin');

  if (isOwner || privileges.includes(privilege)) {
    return <>{children}</>;
  }

  return <>{fallback}</>;
};

// --- STAFF SIGNED INVITE ACTIVATION VIEW ---
const AcceptInvite = () => {
  const { userId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [passwordConf, setPasswordConf] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const queryParams = new URLSearchParams(location.search);
  const expires = queryParams.get('expires');
  const signature = queryParams.get('signature');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!expires || !signature) {
      setError('This activation link is invalid: missing signature.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    if (password !== passwordConf) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/staff/activate/${userId}?expires=${expires}&signature=${signature}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          password,
          password_confirmation: passwordConf,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Activation failed.');
      }

      setSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Failed to activate account. The link may have expired.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="login-container">
        <div className="login-card" style={{ textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', padding: '12px', borderRadius: '50%', backgroundColor: 'rgba(16, 185, 129, 0.1)', color: 'var(--status-active)', marginBottom: '16px' }}>
            <CheckCircle size={36} />
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>Account Activated</h1>
          <p style={{ color: 'var(--text-muted)', margin: '12px 0 24px 0' }}>Your staff credentials have been successfully updated. You may now log in.</p>
          <button onClick={() => navigate('/login')} className="btn btn-primary" style={{ width: '100%' }}>Go to Sign In</button>
        </div>
      </div>
    );
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{ display: 'inline-flex', padding: '12px', borderRadius: '16px', backgroundColor: 'rgba(139, 92, 246, 0.1)', color: 'var(--accent-purple)', marginBottom: '16px' }}>
            <Key size={30} />
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>Set Staff Password</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '8px' }}>Activate your account invitation</p>
        </div>

        {error && (
          <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: 'var(--status-inactive)', padding: '12px 16px', borderRadius: '10px', fontSize: '13px', marginBottom: '20px', display: 'flex', gap: '8px', alignItems: 'center' }}>
            <XCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="pass">Choose Password</label>
            <input
              id="pass"
              type="password"
              className="form-input"
              required
              placeholder="Min 8 characters"
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="pass-conf">Confirm Password</label>
            <input
              id="pass-conf"
              type="password"
              className="form-input"
              required
              placeholder="Retype password"
              value={passwordConf}
              onChange={e => setPasswordConf(e.target.value)}
            />
          </div>

          <button type="submit" disabled={loading} className="btn btn-primary" style={{ width: '100%', height: '46px', marginTop: '16px' }}>
            {loading ? 'Activating Account...' : 'Activate Account'}
          </button>
        </form>
      </div>
    </div>
  );
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
  const outboxItems = useLiveQuery(() => db.outbox.toArray()) || [];
  const localMemberPlans = useLiveQuery(() => db.cache_member_plans.toArray()) || [];

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

  // Member Profile modal
  const [selectedMemberProfile, setSelectedMemberProfile] = useState<any>(null);
  const [showAssignPlanModal, setShowAssignPlanModal] = useState(false);
  const [assignPlanForm, setAssignPlanForm] = useState({
    plan_id: '',
    starts_at: new Date().toISOString().substring(0, 10),
    expires_at: '',
    manual_expiry: false,
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

  // Roles modal form
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [editingRole, setEditingRole] = useState<any>(null);
  const [roleName, setRoleName] = useState('');
  const [rolePrivileges, setRolePrivileges] = useState<string[]>([]);

  // Staff invitation modal form
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteForm, setInviteForm] = useState({ name: '', email: '', role_ids: [] as string[] });
  const [generatedInviteUrl, setGeneratedInviteUrl] = useState('');

  // Sub-tabs state inside Staff view
  const [staffSubTab, setStaffSubTab] = useState<'directory' | 'roles'>('directory');

  // Search states
  const [checkinSearch, setCheckinSearch] = useState('');
  const [memberSearch, setMemberSearch] = useState('');

  // Advisory check-in warning modal state
  const [advisoryWarning, setAdvisoryWarning] = useState<{ member: any; plan: any; type: string } | null>(null);

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

  // Query staff users (real-time only)
  const { data: staff = [], refetch: refetchStaff } = useQuery({
    queryKey: ['staff', token],
    queryFn: async () => {
      if (!isOnline || !token) return [];
      const response = await fetch('/api/staff', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        return await response.json();
      }
      return [];
    },
    enabled: !!token && isOnline,
  });

  // Query roles (real-time only)
  const { data: serverRoles = [], refetch: refetchServerRoles } = useQuery({
    queryKey: ['server_roles', token],
    queryFn: async () => {
      if (!isOnline || !token) return [];
      const response = await fetch('/api/roles', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        return await response.json();
      }
      return [];
    },
    enabled: !!token && isOnline,
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
      
      localStorage.setItem('gym_auth_token', data.token);
      localStorage.setItem('tenant_slug', data.tenant ? data.tenant.slug : '');
      localStorage.setItem('user_privileges', JSON.stringify(data.privileges));
      localStorage.setItem('user_roles', JSON.stringify(data.roles));
      localStorage.setItem('user_info', JSON.stringify(data.user));

      setToken(data.token);
      setTenantSlug(data.tenant ? data.tenant.slug : '');
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
  const handleCheckin = async (memberId: string, force = false) => {
    const member = members.find((m: any) => m.id === memberId);
    if (!member) return;

    // Get active subscription
    const activeSub = localMemberPlans.find((p: any) => p.member_id === memberId && p.status === 'active');
    const plan = activeSub ? plans.find((pl: any) => pl.id === activeSub.plan_id) : null;

    // Run checkin warnings
    if (!force) {
      if (!activeSub) {
        setAdvisoryWarning({ member, plan: null, type: 'no_plan' });
        return;
      }
      if (activeSub.status === 'frozen') {
        setAdvisoryWarning({ member, plan, type: 'frozen' });
        return;
      }
      if (new Date(activeSub.expires_at) < new Date()) {
        setAdvisoryWarning({ member, plan, type: 'expired' });
        return;
      }
      if (plan && plan.session_limit !== null && activeSub.sessions_used >= plan.session_limit) {
        setAdvisoryWarning({ member, plan, type: 'over_limit' });
        return;
      }
    }

    const attendanceId = crypto.randomUUID();
    const checked_in_at = new Date().toISOString();
    const payload = {
      id: attendanceId,
      member_id: memberId,
      member_plan_id: activeSub ? activeSub.id : null,
      checked_in_at,
      method: 'kiosk',
    };

    try {
      await SyncManager.queueWrite('attendances', 'create', attendanceId, payload);
      
      // Optimistically update sessions count in cache
      if (activeSub) {
        await db.cache_member_plans.update(activeSub.id, {
          sessions_used: activeSub.sessions_used + 1,
          status: plan && plan.session_limit !== null && (activeSub.sessions_used + 1) >= plan.session_limit ? 'expired' : 'active'
        });
      }

      queryClient.invalidateQueries({ queryKey: ['attendances'] });
      queryClient.invalidateQueries({ queryKey: ['members'] });
      showToast(`Successfully checked in ${member.first_name}!`);
      setCheckinSearch('');
      setAdvisoryWarning(null);
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

  // Assign Plan to member (Optimistic UI)
  const handleAssignPlanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMemberProfile) return;

    const subId = crypto.randomUUID();
    const plan = plans.find((p: any) => p.id === assignPlanForm.plan_id);
    if (!plan) return;

    const payload = {
      member_id: selectedMemberProfile.id,
      plan_id: assignPlanForm.plan_id,
      starts_at: new Date(assignPlanForm.starts_at).toISOString(),
      expires_at: new Date(assignPlanForm.expires_at).toISOString(),
      status: 'active',
      sessions_used: 0,
    };

    try {
      await SyncManager.queueWrite('member_plans', 'create', subId, payload);
      queryClient.invalidateQueries({ queryKey: ['members'] });
      showToast(`Plan "${plan.name}" successfully assigned.`);
      setShowAssignPlanModal(false);
      
      // Update selected profile view
      const freshSub = { ...payload, id: subId, plan };
      setSelectedMemberProfile((prev: any) => ({
        ...prev,
        active_plan: freshSub
      }));
    } catch (err) {
      showToast('Error assigning plan.', 'error');
    }
  };

  // Freeze / Unfreeze plan subscription (Optimistic UI)
  const handleToggleFreeze = async (subscription: any) => {
    const isFrozen = subscription.status === 'frozen';
    const actionStatus = isFrozen ? 'active' : 'frozen';

    try {
      await SyncManager.queueWrite('member_plans', 'update', subscription.id, {
        id: subscription.id,
        status: actionStatus,
      });

      // Optimistically update local IndexedDB cache table immediately
      await db.cache_member_plans.update(subscription.id, {
        status: actionStatus,
        frozen_at: isFrozen ? null : new Date().toISOString(),
      });

      queryClient.invalidateQueries({ queryKey: ['members'] });
      
      setSelectedMemberProfile((prev: any) => ({
        ...prev,
        active_plan: {
          ...prev.active_plan,
          status: actionStatus,
          frozen_at: isFrozen ? null : new Date().toISOString()
        }
      }));

      showToast(isFrozen ? 'Subscription unfrozen.' : 'Subscription frozen.');
    } catch (e) {
      showToast('Error modifying freeze state.', 'error');
    }
  };

  // Dynamic Expiry Date Calculator on Plan Form selections
  useEffect(() => {
    const plan = plans.find((p: any) => p.id === assignPlanForm.plan_id);
    if (!plan || assignPlanForm.manual_expiry) return;

    const starts = new Date(assignPlanForm.starts_at);
    let expires = new Date(starts);

    if (plan.billing_cycle === 'weekly') {
      expires.setDate(starts.getDate() + 7);
    } else if (plan.billing_cycle === 'monthly') {
      expires.setMonth(starts.getMonth() + 1);
    } else if (plan.billing_cycle === 'quarterly') {
      expires.setMonth(starts.getMonth() + 3);
    } else if (plan.billing_cycle === 'annual') {
      expires.setFullYear(starts.getFullYear() + 1);
    } else if (plan.billing_cycle === 'custom_days' && plan.custom_cycle_days) {
      expires.setDate(starts.getDate() + plan.custom_cycle_days);
    } else {
      expires.setFullYear(starts.getFullYear() + 10); // lifetime fallback
    }

    setAssignPlanForm(prev => ({
      ...prev,
      expires_at: expires.toISOString().substring(0, 10),
    }));
  }, [assignPlanForm.plan_id, assignPlanForm.starts_at, assignPlanForm.manual_expiry, plans]);

  // Create/Edit Role
  const handleRoleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !isOnline) return;

    try {
      let roleId = editingRole ? editingRole.id : null;

      if (editingRole) {
        const resName = await fetch(`/api/roles/${roleId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': `Bearer ${token}`,
            'X-Tenant-Slug': tenantSlug,
          },
          body: JSON.stringify({ name: roleName })
        });
        if (!resName.ok) throw new Error('Failed to update role name.');
      } else {
        const resCreate = await fetch('/api/roles', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': `Bearer ${token}`,
            'X-Tenant-Slug': tenantSlug,
          },
          body: JSON.stringify({ name: roleName })
        });
        if (!resCreate.ok) throw new Error('Failed to create role.');
        const newRole = await resCreate.json();
        roleId = newRole.id;
      }

      const resPrivs = await fetch(`/api/roles/${roleId}/privileges`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${token}`,
          'X-Tenant-Slug': tenantSlug,
        },
        body: JSON.stringify({ privilege_keys: rolePrivileges })
      });

      if (!resPrivs.ok) throw new Error('Failed to sync role permissions.');

      showToast('Role configuration saved successfully.');
      setShowRoleModal(false);
      setEditingRole(null);
      setRoleName('');
      setRolePrivileges([]);
      refetchServerRoles();
    } catch (err: any) {
      showToast(err.message || 'Error configuring role.', 'error');
    }
  };

  // Delete Role
  const handleDeleteRole = async (id: string) => {
    if (!token || !isOnline) return;
    if (!confirm('Are you sure you want to delete this role?')) return;

    try {
      const response = await fetch(`/api/roles/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
          'X-Tenant-Slug': tenantSlug,
        }
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Failed to delete role.');
      }

      showToast('Role deleted successfully.');
      refetchServerRoles();
    } catch (err: any) {
      showToast(err.message || 'Error deleting role.', 'error');
    }
  };

  // Invite Staff User
  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !isOnline) return;

    try {
      const response = await fetch('/api/staff/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${token}`,
          'X-Tenant-Slug': tenantSlug,
        },
        body: JSON.stringify(inviteForm),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Failed to invite staff.');
      }

      const serverUrl = new URL(data.activation_url);
      const frontendActivationUrl = `${window.location.origin}/accept-invite/${data.user.id}${serverUrl.search}`;
      
      setGeneratedInviteUrl(frontendActivationUrl);
      refetchStaff();
      setInviteForm({ name: '', email: '', role_ids: [] });
    } catch (err: any) {
      showToast(err.message || 'Error sending invitation.', 'error');
    }
  };

  // Resend signed invitation URL
  const handleResendInvite = async (userId: string) => {
    if (!token || !isOnline) return;

    try {
      const response = await fetch(`/api/staff/${userId}/resend`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
          'X-Tenant-Slug': tenantSlug,
        }
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Failed to resend invite.');

      const serverUrl = new URL(data.activation_url);
      const frontendActivationUrl = `${window.location.origin}/accept-invite/${userId}${serverUrl.search}`;

      setGeneratedInviteUrl(frontendActivationUrl);
      showToast('New invitation link generated.');
    } catch (err: any) {
      showToast(err.message || 'Error generating link.', 'error');
    }
  };

  // Revoke staff invitation
  const handleRevokeInvite = async (userId: string) => {
    if (!token || !isOnline) return;
    if (!confirm('Are you sure you want to revoke this invitation?')) return;

    try {
      const response = await fetch(`/api/staff/${userId}/revoke`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
          'X-Tenant-Slug': tenantSlug,
        }
      });

      if (!response.ok) throw new Error('Failed to revoke invitation.');

      showToast('Invitation revoked.');
      refetchStaff();
    } catch (err: any) {
      showToast(err.message || 'Error revoking invitation.', 'error');
    }
  };

  // Toggle staff Active / Disabled account status
  const handleToggleStaff = async (userId: string) => {
    if (!token || !isOnline) return;

    try {
      const response = await fetch(`/api/staff/${userId}/toggle`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
          'X-Tenant-Slug': tenantSlug,
        }
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Failed to toggle account status.');

      showToast(data.message);
      refetchStaff();
    } catch (err: any) {
      showToast(err.message || 'Error changing staff status.', 'error');
    }
  };

  // Helper toggle privilege key selection checklist
  const togglePrivilegeKey = (key: string) => {
    if (rolePrivileges.includes(key)) {
      setRolePrivileges(rolePrivileges.filter(k => k !== key));
    } else {
      setRolePrivileges([...rolePrivileges, key]);
    }
  };

  // Retry conflict outbox writes
  const handleRetryConflict = async (item: any) => {
    await db.outbox.update(item.localId!, { status: 'pending' });
    showToast('Retrying outbox synchronization in background.');
    if (token) {
      SyncManager.syncNow(token).then(() => queryClient.invalidateQueries());
    }
  };

  // Discard conflict outbox writes
  const handleDiscardConflict = async (id: number) => {
    await db.outbox.delete(id);
    showToast('Conflicted transaction discarded.');
  };

  const getSyncStatusIcon = (clientUuid: string) => {
    const item = outboxItems.find(i => i.clientUuid === clientUuid);
    if (!item) return <span title="Synced"><CheckCircle size={14} style={{ color: 'var(--status-active)' }} /></span>;
    
    if (item.status === 'pending') {
      return <span title="Pending offline sync"><RefreshCw size={14} className="spin" style={{ color: 'var(--status-offline)' }} /></span>;
    }
    if (item.status === 'conflict') {
      return <span title="Sync conflict logged"><XCircle size={14} style={{ color: 'var(--status-inactive)' }} /></span>;
    }
    return <span title="Synced"><CheckCircle size={14} style={{ color: 'var(--status-active)' }} /></span>;
  };

  const privilegeList = [
    { key: 'members.view', label: 'View Member Directory', category: 'Members' },
    { key: 'members.create', label: 'Create New Members', category: 'Members' },
    { key: 'members.update', label: 'Edit Member Profiles', category: 'Members' },
    { key: 'plans.view', label: 'View Membership Plans', category: 'Plans' },
    { key: 'plans.create', label: 'Create Billing Plans', category: 'Plans' },
    { key: 'plans.update', label: 'Modify Billing Plans', category: 'Plans' },
    { key: 'plans.delete', label: 'Soft Delete Billing Plans', category: 'Plans' },
    { key: 'attendance.view', label: 'View Daily Check-ins', category: 'Attendance' },
    { key: 'attendance.mark', label: 'Log Attendance Entries', category: 'Attendance' },
    { key: 'roles.view', label: 'View Authorization Roles', category: 'Roles' },
    { key: 'roles.create', label: 'Create Custom Roles', category: 'Roles' },
    { key: 'roles.edit', label: 'Edit Roles & Privileges', category: 'Roles' },
    { key: 'roles.delete', label: 'Delete Custom Roles', category: 'Roles' },
    { key: 'staff.view', label: 'View Staff Directory', category: 'Staff' },
    { key: 'staff.invite', label: 'Invite Staff Members', category: 'Staff' },
  ];

  const conflictItems = outboxItems.filter(i => i.status === 'conflict');

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
        {/* Sign invite token route */}
        <Route path="/accept-invite/:userId" element={<AcceptInvite />} />

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
                      placeholder="e.g. apex (leave blank for Super Admin)"
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
            {user?.is_super_admin ? (
              <SuperAdminLayout />
            ) : (
              <>
                <div className="app-container tenant-theme" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
                  {localStorage.getItem('is_impersonating') === 'true' && <ImpersonationBanner />}
                  <div style={{ display: 'flex', flex: 1 }}>
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

                  {(hasPrivilege('staff.view') || hasPrivilege('roles.view')) && (
                    <button onClick={() => navigate('/staff-roles')} className={`sidebar-link ${location.pathname === '/staff-roles' ? 'active' : ''}`}>
                      <Shield size={18} />
                      <span>Staff & Roles</span>
                    </button>
                  )}

                  {hasPrivilege('finance.view') && (
                    <button onClick={() => navigate('/finance')} className={`sidebar-link ${location.pathname.startsWith('/finance') ? 'active' : ''}`}>
                      <DollarSign size={18} />
                      <span>Finance</span>
                    </button>
                  )}

                  {hasPrivilege('hr.staff.manage') && (
                    <button onClick={() => navigate('/hr')} className={`sidebar-link ${location.pathname.startsWith('/hr') ? 'active' : ''}`}>
                      <Briefcase size={18} />
                      <span>HR Management</span>
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
                        {/* Conflict resolution panel */}
                        {conflictItems.length > 0 && (
                          <div className="card" style={{ border: '1px solid var(--status-inactive)', backgroundColor: 'rgba(239, 68, 68, 0.05)', marginBottom: '32px', textAlign: 'left' }}>
                            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--status-inactive)', fontSize: '16px', fontWeight: 'bold', marginBottom: '12px' }}>
                              <XCircle size={20} />
                              <span>Needs Review: Sync Conflicts Detected ({conflictItems.length})</span>
                            </h3>
                            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                              Some offline updates could not be synchronized automatically. Please reconcile them below.
                            </p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                              {conflictItems.map(item => (
                                <div key={item.localId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', backgroundColor: 'var(--bg-primary)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                                  <div style={{ fontSize: '13px' }}>
                                    <span style={{ fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--accent-purple)' }}>{item.entity}</span>
                                    <span style={{ margin: '0 8px', color: 'var(--text-muted)' }}>|</span>
                                    <span>Record: {item.payload.name || item.payload.first_name || item.clientUuid}</span>
                                  </div>
                                  <div style={{ display: 'flex', gap: '8px' }}>
                                    <button onClick={() => handleRetryConflict(item)} className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '12px' }}>Retry Sync</button>
                                    <button onClick={() => handleDiscardConflict(item.localId!)} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }}>Discard</button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

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
                                  <th>Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {filteredMembers.length === 0 ? (
                                  <tr>
                                    <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px' }}>
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
                                      <td>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                          <button onClick={() => {
                                            const activeSub = localMemberPlans.find((p: any) => p.member_id === member.id && p.status === 'active');
                                            const activePlan = activeSub ? plans.find((pl: any) => pl.id === activeSub.plan_id) : null;
                                            setSelectedMemberProfile({
                                              ...member,
                                              active_plan: activeSub ? { ...activeSub, plan: activePlan } : null,
                                              subscriptions: localMemberPlans.filter((p: any) => p.member_id === member.id),
                                              attendances: attendances.filter((a: any) => a.member_id === member.id),
                                            });
                                          }} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '13px', borderRadius: '8px' }}>
                                            Profile
                                          </button>
                                          {hasPrivilege('members.create') && (
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
                                          )}
                                        </div>
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
                                  <th>Sync</th>
                                  <th>Member</th>
                                  <th>Method</th>
                                  <th>Checked In At</th>
                                </tr>
                              </thead>
                              <tbody>
                                {attendances.length === 0 ? (
                                  <tr>
                                    <td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px' }}>
                                      No check-in logs recorded.
                                    </td>
                                  </tr>
                                ) : (
                                  attendances.map((log: any) => {
                                    const member = members.find((m: any) => m.id === log.member_id);
                                    return (
                                      <tr key={log.id}>
                                        <td>{getSyncStatusIcon(log.id)}</td>
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

                    {/* Staff and Roles Management View */}
                    <Route path="/staff-roles" element={
                      (hasPrivilege('staff.view') || hasPrivilege('roles.view')) ? (
                        <div>
                          {/* Subtabs selector */}
                          <div style={{ display: 'flex', gap: '16px', borderBottom: '1px solid var(--border-color)', marginBottom: '24px' }}>
                            {hasPrivilege('staff.view') && (
                              <button onClick={() => setStaffSubTab('directory')} className={`sidebar-link ${staffSubTab === 'directory' ? 'active' : ''}`} style={{ border: 'none', borderBottom: staffSubTab === 'directory' ? '2px solid var(--accent-purple)' : 'none', padding: '12px 16px', borderRadius: 0, cursor: 'pointer' }}>
                                Staff Directory
                              </button>
                            )}
                            {hasPrivilege('roles.view') && (
                              <button onClick={() => setStaffSubTab('roles')} className={`sidebar-link ${staffSubTab === 'roles' ? 'active' : ''}`} style={{ border: 'none', borderBottom: staffSubTab === 'roles' ? '2px solid var(--accent-purple)' : 'none', padding: '12px 16px', borderRadius: 0, cursor: 'pointer' }}>
                                Roles & Privileges
                              </button>
                            )}
                          </div>

                          {/* Subtab 1: Staff Directory */}
                          {staffSubTab === 'directory' && hasPrivilege('staff.view') && (
                            <div>
                              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '20px' }}>
                                {hasPrivilege('staff.invite') && (
                                  <button onClick={() => { setGeneratedInviteUrl(''); setShowInviteModal(true); }} className="btn btn-primary">
                                    <Plus size={18} />
                                    <span>Invite Staff</span>
                                  </button>
                                )}
                              </div>

                              <div className="table-container">
                                <table className="custom-table">
                                  <thead>
                                    <tr>
                                      <th>Name</th>
                                      <th>Email</th>
                                      <th>Assigned Roles</th>
                                      <th>Status</th>
                                      {hasPrivilege('staff.invite') && <th>Actions</th>}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {staff.length === 0 ? (
                                      <tr>
                                        <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px' }}>
                                          {isOnline ? 'No staff users found.' : 'Staff directory requires an online connection.'}
                                        </td>
                                      </tr>
                                    ) : (
                                      staff.map((member: any) => (
                                        <tr key={member.id}>
                                          <td style={{ fontWeight: '600' }}>{member.name}</td>
                                          <td>{member.email}</td>
                                          <td>{member.roles.map((r: any) => r.name).join(', ') || 'No Role'}</td>
                                          <td>
                                            <span className={`badge badge-${member.status === 'active' ? 'active' : member.status === 'invited' ? 'frozen' : 'inactive'}`}>
                                              {member.status}
                                            </span>
                                          </td>
                                          {hasPrivilege('staff.invite') && (
                                            <td>
                                              <div style={{ display: 'flex', gap: '8px' }}>
                                                {member.status === 'invited' ? (
                                                  <>
                                                    <button onClick={() => handleResendInvite(member.id)} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }}>Resend</button>
                                                    <button onClick={() => handleRevokeInvite(member.id)} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px', color: 'var(--status-inactive)' }}>Revoke</button>
                                                  </>
                                                ) : (
                                                  <button onClick={() => handleToggleStaff(member.id)} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }}>
                                                    {member.status === 'active' ? 'Disable' : 'Enable'}
                                                  </button>
                                                )}
                                              </div>
                                            </td>
                                          )}
                                        </tr>
                                      ))
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}

                          {/* Subtab 2: Roles and Permissions Gating */}
                          {staffSubTab === 'roles' && hasPrivilege('roles.view') && (
                            <div>
                              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '20px' }}>
                                {hasPrivilege('roles.create') && (
                                  <button onClick={() => { setEditingRole(null); setRoleName(''); setRolePrivileges([]); setShowRoleModal(true); }} className="btn btn-primary">
                                    <Plus size={18} />
                                    <span>Create Custom Role</span>
                                  </button>
                                )}
                              </div>

                              <div className="table-container">
                                <table className="custom-table">
                                  <thead>
                                    <tr>
                                      <th>Role Name</th>
                                      <th>Staff Assigned</th>
                                      <th>Permissions Count</th>
                                      {hasPrivilege('roles.edit') && <th>Actions</th>}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {serverRoles.length === 0 ? (
                                      <tr>
                                        <td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px' }}>
                                          {isOnline ? 'No custom roles seeded.' : 'Roles management requires an online connection.'}
                                        </td>
                                      </tr>
                                    ) : (
                                      serverRoles.map((role: any) => (
                                        <tr key={role.id}>
                                          <td style={{ fontWeight: '600' }}>
                                            {role.name} {role.is_system_role && <span style={{ fontSize: '10px', opacity: 0.6, verticalAlign: 'middle', padding: '2px 6px', borderRadius: '4px', backgroundColor: 'var(--bg-tertiary)' }}>System</span>}
                                          </td>
                                          <td>{role.users_count !== undefined ? role.users_count : 0} staff</td>
                                          <td>{role.is_system_role || role.name === 'Owner' ? 'All (SuperAdmin)' : `${role.privileges.length} keys`}</td>
                                          {hasPrivilege('roles.edit') && (
                                            <td>
                                              <div style={{ display: 'flex', gap: '8px' }}>
                                                <button 
                                                  onClick={() => {
                                                    setEditingRole(role);
                                                    setRoleName(role.name);
                                                    setRolePrivileges(role.privileges.map((p: any) => p.key));
                                                    setShowRoleModal(true);
                                                  }} 
                                                  className="btn btn-secondary" 
                                                  style={{ padding: '6px 12px', fontSize: '12px' }}
                                                  disabled={role.is_system_role || role.name === 'Owner'}
                                                >
                                                  Edit Checklists
                                                </button>
                                                <button 
                                                  onClick={() => handleDeleteRole(role.id)} 
                                                  className="btn btn-secondary" 
                                                  style={{ padding: '6px 12px', fontSize: '12px', color: 'var(--status-inactive)' }}
                                                  disabled={role.is_system_role || role.name === 'Owner'}
                                                >
                                                  Delete
                                                </button>
                                              </div>
                                            </td>
                                          )}
                                        </tr>
                                      ))
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : <Navigate to="/" replace />
                    } />

                    {/* Finance view */}
                    <Route path="/finance" element={
                      hasPrivilege('finance.view') ? <FinanceDashboard /> : <Navigate to="/" replace />
                    } />

                    {/* HR view */}
                    <Route path="/hr" element={
                      hasPrivilege('hr.staff.manage') ? <HRDashboard /> : <Navigate to="/" replace />
                    } />

                    {/* Catch-all fallback */}
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </div>
              </div>
              </div>
            </div>

            {/* Member Profile Modal */}
            {selectedMemberProfile && (
              <div className="modal-overlay">
                <div className="modal-card" style={{ maxWidth: '700px', maxHeight: '90vh', overflowY: 'auto', textAlign: 'left' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '20px', fontWeight: 'bold' }}>
                      <User size={24} style={{ color: 'var(--accent-purple)' }} />
                      <span>{selectedMemberProfile.first_name} {selectedMemberProfile.last_name}</span>
                    </h3>
                    <span className={`badge badge-${selectedMemberProfile.status.toLowerCase()}`}>{selectedMemberProfile.status}</span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
                    <div>
                      <h4 style={{ color: 'var(--text-muted)', fontSize: '12px', textTransform: 'uppercase', marginBottom: '8px' }}>Personal Info</h4>
                      <p style={{ fontSize: '14px', marginBottom: '4px' }}><strong>Email:</strong> {selectedMemberProfile.email || 'N/A'}</p>
                      <p style={{ fontSize: '14px' }}><strong>Phone:</strong> {selectedMemberProfile.phone || 'N/A'}</p>
                    </div>

                    <div>
                      <h4 style={{ color: 'var(--text-muted)', fontSize: '12px', textTransform: 'uppercase', marginBottom: '8px' }}>Current Subscription</h4>
                      {selectedMemberProfile.active_plan ? (
                        <div style={{ padding: '12px', backgroundColor: 'var(--bg-primary)', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                          <div style={{ fontWeight: 'bold', fontSize: '15px', display: 'flex', justifyContent: 'space-between' }}>
                            <span>{selectedMemberProfile.active_plan.plan?.name || 'Assigned Plan'}</span>
                            <span className={`badge badge-${selectedMemberProfile.active_plan.status}`}>{selectedMemberProfile.active_plan.status}</span>
                          </div>
                          <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '6px' }}>
                            Expires: {new Date(selectedMemberProfile.active_plan.expires_at).toLocaleDateString()}
                          </div>
                          <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>
                            Sessions: {selectedMemberProfile.active_plan.plan?.session_limit !== null ? `${selectedMemberProfile.active_plan.sessions_used} / ${selectedMemberProfile.active_plan.plan?.session_limit}` : `${selectedMemberProfile.active_plan.sessions_used} used (unlimited)`}
                          </div>
                          <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                            {hasPrivilege('members.create') && (
                              <button onClick={() => handleToggleFreeze(selectedMemberProfile.active_plan)} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px', width: '100%' }}>
                                {selectedMemberProfile.active_plan.status === 'frozen' ? 'Unfreeze' : 'Freeze'}
                              </button>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div>
                          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px' }}>No active subscription plan.</p>
                          {hasPrivilege('members.create') && (
                            <button onClick={() => {
                              setAssignPlanForm({ plan_id: plans[0]?.id || '', starts_at: new Date().toISOString().substring(0, 10), expires_at: '', manual_expiry: false });
                              setShowAssignPlanModal(true);
                            }} className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '12px' }}>
                              Assign Membership Plan
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Attendance Log list */}
                  <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
                    <h4 style={{ color: 'var(--text-muted)', fontSize: '12px', textTransform: 'uppercase', marginBottom: '12px' }}>Attendance History ({selectedMemberProfile.attendances?.length || 0})</h4>
                    <div style={{ maxHeight: '180px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '10px' }}>
                      {(!selectedMemberProfile.attendances || selectedMemberProfile.attendances.length === 0) ? (
                        <div style={{ padding: '16px', textAlign: 'center', fontSize: '13px', color: 'var(--text-muted)' }}>No attendances logged.</div>
                      ) : (
                        selectedMemberProfile.attendances.map((att: any) => (
                          <div key={att.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid var(--border-color)' }}>
                            <span style={{ fontSize: '13px' }}>{new Date(att.checked_in_at).toLocaleString()}</span>
                            <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{att.method || 'Kiosk'}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px' }}>
                    <button onClick={() => setSelectedMemberProfile(null)} className="btn btn-secondary">Close Profile</button>
                  </div>
                </div>
              </div>
            )}

            {/* Assign Plan Modal */}
            {showAssignPlanModal && (
              <div className="modal-overlay">
                <div className="modal-card" style={{ zIndex: 1100 }}>
                  <h3 className="modal-title">Assign Membership Plan</h3>
                  <form onSubmit={handleAssignPlanSubmit}>
                    <div className="form-group">
                      <label className="form-label" htmlFor="plan-select">Select Plan</label>
                      <select id="plan-select" className="form-select" value={assignPlanForm.plan_id} onChange={e => setAssignPlanForm({ ...assignPlanForm, plan_id: e.target.value })}>
                        {plans.map((p: any) => (
                          <option key={p.id} value={p.id}>{p.name} - ${p.price}</option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="starts-date">Starts At</label>
                      <input id="starts-date" type="date" className="form-input" required value={assignPlanForm.starts_at} onChange={e => setAssignPlanForm({ ...assignPlanForm, starts_at: e.target.value })} />
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="expires-date">Expires At</label>
                      <input id="expires-date" type="date" className="form-input" required disabled={!assignPlanForm.manual_expiry} value={assignPlanForm.expires_at} onChange={e => setAssignPlanForm({ ...assignPlanForm, expires_at: e.target.value })} />
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px', cursor: 'pointer' }}>
                        <input type="checkbox" checked={assignPlanForm.manual_expiry} onChange={e => setAssignPlanForm({ ...assignPlanForm, manual_expiry: e.target.checked })} />
                        <span>Override computed date manually</span>
                      </label>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                      <button type="button" onClick={() => setShowAssignPlanModal(false)} className="btn btn-secondary">Cancel</button>
                      <button type="submit" className="btn btn-primary">Confirm Assignment</button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* Advisory Warnings checkin Modal */}
            {advisoryWarning && (
              <div className="modal-overlay">
                <div className="modal-card" style={{ zIndex: 1200 }}>
                  <h3 className="modal-title" style={{ color: 'var(--status-offline)', display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <Info size={24} />
                    <span>Check-in Advisory Warning</span>
                  </h3>
                  <p style={{ margin: '16px 0', fontSize: '14px', lineHeight: 1.6, textAlign: 'left' }}>
                    Member <strong>{advisoryWarning.member.first_name} {advisoryWarning.member.last_name}</strong> is flagged:
                    {advisoryWarning.type === 'no_plan' && <span style={{ display: 'block', color: 'var(--status-inactive)', marginTop: '8px', fontWeight: 'bold' }}>• Has no active membership subscription.</span>}
                    {advisoryWarning.type === 'frozen' && <span style={{ display: 'block', color: 'var(--status-inactive)', marginTop: '8px', fontWeight: 'bold' }}>• Subscription plan is frozen.</span>}
                    {advisoryWarning.type === 'expired' && <span style={{ display: 'block', color: 'var(--status-inactive)', marginTop: '8px', fontWeight: 'bold' }}>• Subscription plan is expired.</span>}
                    {advisoryWarning.type === 'over_limit' && <span style={{ display: 'block', color: 'var(--status-inactive)', marginTop: '8px', fontWeight: 'bold' }}>• Session visit limits exceeded ({advisoryWarning.plan?.session_limit} visits max).</span>}
                  </p>
                  <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                    <button onClick={() => setAdvisoryWarning(null)} className="btn btn-secondary" style={{ width: '50%' }}>Cancel check-in</button>
                    <button onClick={() => handleCheckin(advisoryWarning.member.id, true)} className="btn btn-primary" style={{ width: '50%', backgroundColor: 'var(--status-offline)' }}>Proceed Anyway</button>
                  </div>
                </div>
              </div>
            )}

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

            {/* Roles checklist Modal */}
            {showRoleModal && (
              <div className="modal-overlay">
                <div className="modal-card" style={{ maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto' }}>
                  <h3 className="modal-title">{editingRole ? `Configure privileges: ${editingRole.name}` : 'Create Custom Role'}</h3>
                  <form onSubmit={handleRoleSubmit}>
                    <div className="form-group">
                      <label className="form-label" htmlFor="role-title">Role Title</label>
                      <input id="role-title" type="text" className="form-input" required placeholder="e.g. Trainer" value={roleName} onChange={e => setRoleName(e.target.value)} disabled={editingRole?.is_system_role} />
                    </div>

                    <div className="form-group">
                      <label className="form-label" style={{ marginBottom: '12px' }}>Role Privileges checklist</label>
                      
                      {Array.from(new Set(privilegeList.map(p => p.category))).map(category => (
                        <div key={category} style={{ marginBottom: '20px' }}>
                          <h4 style={{ fontSize: '13px', color: 'var(--accent-purple)', textTransform: 'uppercase', marginBottom: '8px', borderBottom: '1px solid var(--border-color)', paddingBottom: '4px' }}>
                            {category}
                          </h4>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                            {privilegeList.filter(p => p.category === category).map(priv => (
                              <label key={priv.key} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                                <input
                                  type="checkbox"
                                  checked={rolePrivileges.includes(priv.key)}
                                  onChange={() => togglePrivilegeKey(priv.key)}
                                  style={{ accentColor: 'var(--accent-purple)' }}
                                />
                                <span>{priv.label}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                      <button type="button" onClick={() => { setShowRoleModal(false); setEditingRole(null); }} className="btn btn-secondary">Cancel</button>
                      <button type="submit" className="btn btn-primary">Save Role Configuration</button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* Staff invitation / generated link Modal */}
            {showInviteModal && (
              <div className="modal-overlay">
                <div className="modal-card">
                  <h3 className="modal-title">Invite Staff Member</h3>

                  {generatedInviteUrl ? (
                    <div>
                      <div style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', color: 'var(--status-active)', padding: '16px', borderRadius: '12px', fontSize: '13px', marginBottom: '20px' }}>
                        <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>Signed Link Generated!</div>
                        <p>Copy and send this activation link to the invited staff member. It will expire in 3 days.</p>
                      </div>

                      <div className="form-group">
                        <label className="form-label" htmlFor="inv-url">Activation Link</label>
                        <input id="inv-url" type="text" readOnly className="form-input" value={generatedInviteUrl} onClick={e => (e.target as HTMLInputElement).select()} />
                      </div>

                      <button onClick={() => { setShowInviteModal(false); setGeneratedInviteUrl(''); }} className="btn btn-primary" style={{ width: '100%' }}>Done</button>
                    </div>
                  ) : (
                    <form onSubmit={handleInviteSubmit}>
                      <div className="form-group">
                        <label className="form-label" htmlFor="staff-name">Staff Name</label>
                        <input id="staff-name" type="text" className="form-input" required placeholder="e.g. John Trainer" value={inviteForm.name} onChange={e => setInviteForm({ ...inviteForm, name: e.target.value })} />
                      </div>
                      <div className="form-group">
                        <label className="form-label" htmlFor="staff-email">Email Address</label>
                        <input id="staff-email" type="email" className="form-input" required placeholder="john@gym.com" value={inviteForm.email} onChange={e => setInviteForm({ ...inviteForm, email: e.target.value })} />
                      </div>

                      <div className="form-group">
                        <label className="form-label" style={{ marginBottom: '8px' }}>Assign Roles</label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {serverRoles.map((role: any) => (
                            <label key={role.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                              <input
                                type="checkbox"
                                checked={inviteForm.role_ids.includes(role.id)}
                                onChange={e => {
                                  if (e.target.checked) {
                                    setInviteForm({ ...inviteForm, role_ids: [...inviteForm.role_ids, role.id] });
                                  } else {
                                    setInviteForm({ ...inviteForm, role_ids: inviteForm.role_ids.filter(id => id !== role.id) });
                                  }
                                }}
                                style={{ accentColor: 'var(--accent-purple)' }}
                              />
                              <span>{role.name}</span>
                            </label>
                          ))}
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                        <button type="button" onClick={() => setShowInviteModal(false)} className="btn btn-secondary">Cancel</button>
                        <button type="submit" className="btn btn-primary">Generate Invitation</button>
                      </div>
                    </form>
                  )}
                </div>
              </div>
            )}
            </>
            )}
          </AuthGuard>
        } />
      </Routes>
    </div>
  );
}
