import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { 
  Plus, CheckCircle, 
  XCircle, RefreshCw, Key, 
  AlertTriangle, Play 
} from 'lucide-react';

// Common headers for Platform Admin requests
const getHeaders = () => {
  const token = localStorage.getItem('gym_auth_token');
  return {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Authorization': `Bearer ${token}`
  };
};

// ==========================================
// 1. TENANTS LIST SCREEN
// ==========================================
export const PlatformTenants = () => {
  const navigate = useNavigate();
  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Provisioning Modal State
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: '', slug: '', owner_name: '', owner_email: '' });
  const [inviteUrl, setInviteUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchTenants = async () => {
    try {
      const res = await fetch('/api/platform/tenants', { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        setTenants(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTenants();
  }, []);

  const handleToggleStatus = async (id: string, currentStatus: string) => {
    const action = currentStatus === 'suspended' ? 'activate' : 'suspend';
    try {
      const res = await fetch(`/api/platform/tenants/${id}/${action}`, {
        method: 'PATCH',
        headers: getHeaders()
      });
      if (res.ok) {
        fetchTenants();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleProvision = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setInviteUrl('');
    try {
      const res = await fetch('/api/platform/tenants', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(form)
      });
      if (res.ok) {
        const data = await res.json();
        setInviteUrl(data.activation_url);
        setForm({ name: '', slug: '', owner_name: '', owner_email: '' });
        fetchTenants();
      } else {
        const errorData = await res.json();
        alert(errorData.message || 'Provisioning failed.');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="text-center" style={{ padding: '80px 0' }}><RefreshCw className="spin" size={32} /></div>;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h2 style={{ fontSize: '24px', fontWeight: 'bold', color: 'var(--text-primary)' }}>Gym Tenants</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Manage gyms, status, and subscriptions</p>
        </div>
        <button onClick={() => { setShowModal(true); setInviteUrl(''); }} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Plus size={16} />
          <span>Provision Gym</span>
        </button>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="table">
          <thead>
            <tr>
              <th>Gym / Tenant</th>
              <th>Status</th>
              <th>License Status</th>
              <th>Owner Email</th>
              <th>Staff</th>
              <th>Created</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {tenants.map(t => (
              <tr key={t.id}>
                <td>
                  <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{t.name}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{t.slug}</div>
                </td>
                <td>
                  <span className={`badge ${t.status === 'active' ? 'badge-active' : 'badge-inactive'}`}>
                    {t.status}
                  </span>
                </td>
                <td>
                  {t.active_license ? (
                    <div style={{ display: 'flex', flexDirection: 'column', fontSize: '13px' }}>
                      <span style={{ color: 'var(--status-online)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <CheckCircle size={12} /> Active
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        Expires: {new Date(t.active_license.expires_at).toLocaleDateString()}
                      </span>
                    </div>
                  ) : (
                    <span style={{ color: 'var(--status-offline)', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px' }}>
                      <XCircle size={12} /> Unlicensed
                    </span>
                  )}
                </td>
                <td>{t.owner_email}</td>
                <td>{t.staff_count} users</td>
                <td>{new Date(t.created_at).toLocaleDateString()}</td>
                <td>
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button 
                      onClick={() => handleToggleStatus(t.id, t.status)} 
                      className={`btn ${t.status === 'suspended' ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ padding: '6px 12px', fontSize: '12px' }}
                    >
                      {t.status === 'suspended' ? 'Activate' : 'Suspend'}
                    </button>
                    <button 
                      onClick={() => navigate(`/platform/tenants/${t.id}`)} 
                      className="btn btn-secondary"
                      style={{ padding: '6px 12px', fontSize: '12px' }}
                    >
                      Details
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* PROVISIONING MODAL */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '500px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 'bold' }}>Onboard New Gym Tenant</h3>
              <button onClick={() => setShowModal(false)} className="btn btn-secondary" style={{ padding: '4px 8px' }}>&times;</button>
            </div>

            {inviteUrl ? (
              <div style={{ textAlign: 'left' }}>
                <div style={{ backgroundColor: 'rgba(34, 197, 94, 0.1)', border: '1px solid var(--status-online)', padding: '16px', borderRadius: '8px', marginBottom: '20px' }}>
                  <h4 style={{ color: 'var(--status-online)', fontWeight: 'bold', marginBottom: '8px' }}>Gym Provisioned Successfully!</h4>
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                    Provide this secure signed activation URL to the owner user to configure their password:
                  </p>
                </div>
                <div className="form-group">
                  <textarea 
                    readOnly 
                    value={inviteUrl} 
                    className="form-input" 
                    rows={4} 
                    style={{ fontFamily: 'monospace', fontSize: '12px', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
                    onClick={(e: any) => e.target.select()}
                  />
                  <small style={{ color: 'var(--text-muted)', display: 'block', marginTop: '8px' }}>
                    Click inside box to select and copy the invitation URL.
                  </small>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px' }}>
                  <button onClick={() => setShowModal(false)} className="btn btn-primary">Done</button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleProvision}>
                <div className="form-group">
                  <label className="form-label">Gym Name</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    required 
                    placeholder="e.g. Iron Gym" 
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Subdomain Slug</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    required 
                    placeholder="e.g. irongym" 
                    value={form.slug}
                    onChange={e => setForm({ ...form, slug: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Owner Full Name</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    required 
                    placeholder="e.g. John Doe" 
                    value={form.owner_name}
                    onChange={e => setForm({ ...form, owner_name: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Owner Email</label>
                  <input 
                    type="email" 
                    className="form-input" 
                    required 
                    placeholder="e.g. owner@irongym.com" 
                    value={form.owner_email}
                    onChange={e => setForm({ ...form, owner_email: e.target.value })}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                  <button type="button" onClick={() => setShowModal(false)} className="btn btn-secondary">Cancel</button>
                  <button type="submit" disabled={submitting} className="btn btn-primary">
                    {submitting ? 'Provisioning...' : 'Provision Tenant'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};


// ==========================================
// 2. TENANT DETAILS & LICENSE VIEW
// ==========================================
export const PlatformTenantDetails = () => {
  const { tenantId } = useParams();
  const navigate = useNavigate();
  const [tenant, setTenant] = useState<any>(null);
  const [licenses, setLicenses] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [showLicenseModal, setShowLicenseModal] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  
  const [showExtendModal, setShowExtendModal] = useState(false);
  const [selectedLicenseId, setSelectedLicenseId] = useState('');
  const [extendDays, setExtendDays] = useState('30');

  const [showImpersonateModal, setShowImpersonateModal] = useState(false);
  const [impersonateReason, setImpersonateReason] = useState('');

  const fetchDetails = async () => {
    try {
      const headers = getHeaders();
      const [tRes, lRes, pRes] = await Promise.all([
        fetch('/api/platform/tenants', { headers }),
        fetch(`/api/platform/tenants/${tenantId}/licenses`, { headers }),
        fetch('/api/platform/subscription-plans', { headers })
      ]);

      if (tRes.ok && lRes.ok && pRes.ok) {
        const tenants = await tRes.json();
        const currentTenant = tenants.find((t: any) => t.id === tenantId);
        setTenant(currentTenant);
        setLicenses(await lRes.json());
        setPlans(await pRes.json());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetails();
  }, [tenantId]);

  const handleIssueLicense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlanId) return;

    try {
      const res = await fetch(`/api/platform/tenants/${tenantId}/licenses`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ subscription_plan_id: selectedPlanId })
      });
      if (res.ok) {
        setShowLicenseModal(false);
        fetchDetails();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleExtendLicense = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`/api/platform/licenses/${selectedLicenseId}/extend`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify({ days: parseInt(extendDays) })
      });
      if (res.ok) {
        setShowExtendModal(false);
        fetchDetails();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleRevokeLicense = async (id: string) => {
    if (!confirm('Are you absolutely sure you want to revoke this license? It will lock out all gym write actions immediately!')) return;
    try {
      const res = await fetch(`/api/platform/licenses/${id}/revoke`, {
        method: 'PATCH',
        headers: getHeaders()
      });
      if (res.ok) {
        fetchDetails();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleImpersonate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!impersonateReason) return;

    try {
      const res = await fetch(`/api/platform/tenants/${tenantId}/impersonate`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ reason: impersonateReason })
      });

      if (res.ok) {
        const data = await res.json();
        
        // Stash Super Admin token and set impersonation session info
        localStorage.setItem('super_admin_token', localStorage.getItem('gym_auth_token') || '');
        localStorage.setItem('gym_auth_token', data.token);
        localStorage.setItem('is_impersonating', 'true');
        localStorage.setItem('impersonation_tenant_name', tenant.name);
        localStorage.setItem('impersonation_log_id', data.impersonation_log_id);
        
        // Force redirect to reload permissions
        window.location.href = '/';
      } else {
        alert('Failed to initiate impersonation.');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const getSyncHealth = (lastValidated: string | null) => {
    if (!lastValidated) return 'Never validated';
    const seconds = Math.floor((Date.now() - new Date(lastValidated).getTime()) / 1000);
    if (seconds < 60) return 'synced just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `last synced ${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `last synced ${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `last synced ${days}d ago`;
  };

  if (loading) {
    return <div className="text-center" style={{ padding: '80px 0' }}><RefreshCw className="spin" size={32} /></div>;
  }

  const activeLicense = licenses.find(l => l.status === 'active');

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h2 style={{ fontSize: '24px', fontWeight: 'bold', color: 'var(--text-primary)' }}>{tenant.name} Details</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Tenant code: {tenant.slug}</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => navigate('/platform/tenants')} className="btn btn-secondary">Back to List</button>
          <button onClick={() => setShowImpersonateModal(true)} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#f59e0b', color: '#0f172a' }}>
            <Play size={16} />
            <span>Impersonate Gym</span>
          </button>
        </div>
      </div>

      <div className="grid grid-2" style={{ marginBottom: '32px' }}>
        {/* LICENSE CARD */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Key size={18} style={{ color: 'var(--accent-cyan)' }} />
              <span>Subscription License</span>
            </h3>
            
            {activeLicense ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ fontSize: '20px', fontFamily: 'monospace', fontWeight: 'bold', color: 'var(--accent-purple)', letterSpacing: '1px' }}>
                  {activeLicense.license_key}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '14px' }}>
                  <div>Plan: <strong style={{ color: 'var(--text-primary)' }}>{activeLicense.subscription_plan?.name}</strong></div>
                  <div>Expires: <strong style={{ color: 'var(--text-primary)' }}>{new Date(activeLicense.expires_at).toLocaleDateString()}</strong></div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                    ({getSyncHealth(activeLicense.last_validated_at)})
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ color: 'var(--status-offline)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', padding: '16px 0' }}>
                <AlertTriangle size={20} />
                <span>No active license issued for this gym. The app writes will be locked.</span>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '8px', marginTop: '24px' }}>
            <button onClick={() => { setSelectedPlanId(plans[0]?.id || ''); setShowLicenseModal(true); }} className="btn btn-primary" style={{ flex: 1 }}>
              Issue License
            </button>
            {activeLicense && (
              <>
                <button onClick={() => { setSelectedLicenseId(activeLicense.id); setShowExtendModal(true); }} className="btn btn-secondary" style={{ flex: 1 }}>
                  Extend
                </button>
                <button onClick={() => handleRevokeLicense(activeLicense.id)} className="btn btn-secondary" style={{ flex: 1, color: 'var(--status-offline)', borderColor: 'rgba(239, 68, 68, 0.3)' }}>
                  Revoke
                </button>
              </>
            )}
          </div>
        </div>

        {/* METADATA PROFILE */}
        <div className="card">
          <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: '16px' }}>Gym Tenant Profile</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Status:</span>
              <span className={`badge ${tenant.status === 'active' ? 'badge-active' : 'badge-inactive'}`}>{tenant.status}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Owner Contact:</span>
              <span style={{ fontWeight: '600' }}>{tenant.owner_email}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Staff Members:</span>
              <span>{tenant.staff_count} registered users</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '4px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Onboard Date:</span>
              <span>{new Date(tenant.created_at).toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      {/* LICENSE HISTORY */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border-color)' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--text-primary)' }}>License Logs History</h3>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>License Key</th>
              <th>Subscription Plan</th>
              <th>Status</th>
              <th>Issued At</th>
              <th>Expires At</th>
              <th>Last Synced Validation</th>
            </tr>
          </thead>
          <tbody>
            {licenses.map(l => (
              <tr key={l.id}>
                <td style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>{l.license_key}</td>
                <td>{l.subscription_plan?.name}</td>
                <td>
                  <span className={`badge ${l.status === 'active' ? 'badge-active' : 'badge-inactive'}`}>
                    {l.status}
                  </span>
                </td>
                <td>{new Date(l.starts_at).toLocaleDateString()}</td>
                <td>{new Date(l.expires_at).toLocaleDateString()}</td>
                <td>{l.last_validated_at ? new Date(l.last_validated_at).toLocaleString() : 'N/A'}</td>
              </tr>
            ))}
            {licenses.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>No license logs found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ISSUE LICENSE MODAL */}
      {showLicenseModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '400px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 'bold' }}>Issue New License</h3>
              <button onClick={() => setShowLicenseModal(false)} className="btn btn-secondary" style={{ padding: '4px 8px' }}>&times;</button>
            </div>
            <form onSubmit={handleIssueLicense}>
              <div className="form-group">
                <label className="form-label">Subscription Plan</label>
                <select 
                  className="form-input" 
                  value={selectedPlanId}
                  onChange={e => setSelectedPlanId(e.target.value)}
                >
                  {plans.filter(p => p.is_active).map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} (${p.price} / {p.duration_days} days)
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                <button type="button" onClick={() => setShowLicenseModal(false)} className="btn btn-secondary">Cancel</button>
                <button type="submit" className="btn btn-primary">Generate License</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EXTEND LICENSE MODAL */}
      {showExtendModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '400px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 'bold' }}>Extend License Term</h3>
              <button onClick={() => setShowExtendModal(false)} className="btn btn-secondary" style={{ padding: '4px 8px' }}>&times;</button>
            </div>
            <form onSubmit={handleExtendLicense}>
              <div className="form-group">
                <label className="form-label">Renewal Period</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                  <button type="button" onClick={() => setExtendDays('7')} className={`btn ${extendDays === '7' ? 'btn-primary' : 'btn-secondary'}`}>+7 Days</button>
                  <button type="button" onClick={() => setExtendDays('30')} className={`btn ${extendDays === '30' ? 'btn-primary' : 'btn-secondary'}`}>+30 Days</button>
                  <button type="button" onClick={() => setExtendDays('90')} className={`btn ${extendDays === '90' ? 'btn-primary' : 'btn-secondary'}`}>+90 Days</button>
                  <button type="button" onClick={() => setExtendDays('365')} className={`btn ${extendDays === '365' ? 'btn-primary' : 'btn-secondary'}`}>+365 Days</button>
                </div>
                <input 
                  type="number" 
                  className="form-input" 
                  required 
                  min="1"
                  value={extendDays}
                  onChange={e => setExtendDays(e.target.value)}
                  placeholder="Custom Days"
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                <button type="button" onClick={() => setShowExtendModal(false)} className="btn btn-secondary">Cancel</button>
                <button type="submit" className="btn btn-primary">Extend Validity</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* IMPERSONATION MODAL */}
      {showImpersonateModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '450px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 'bold' }}>Begin Audited Impersonation</h3>
              <button onClick={() => setShowImpersonateModal(false)} className="btn btn-secondary" style={{ padding: '4px 8px' }}>&times;</button>
            </div>
            <form onSubmit={handleImpersonate}>
              <div style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', border: '1px solid #f59e0b', padding: '12px', borderRadius: '8px', fontSize: '13px', color: '#d97706', marginBottom: '20px' }}>
                <strong>Audit Compliance Warning:</strong> This operation requires entering a valid justification. Every transaction executed will be logged under this session.
              </div>
              <div className="form-group">
                <label className="form-label">Justification / Reason (Required)</label>
                <textarea 
                  className="form-input" 
                  required 
                  rows={3}
                  value={impersonateReason}
                  onChange={e => setImpersonateReason(e.target.value)}
                  placeholder="e.g. Resolving database sync dispute on member plans..."
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                <button type="button" onClick={() => setShowImpersonateModal(false)} className="btn btn-secondary">Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ backgroundColor: '#f59e0b', color: '#0f172a' }}>
                  Launch Impersonation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};


// ==========================================
// 3. PLATFORM SUBSCRIPTION PLANS
// ==========================================
export const PlatformSubscriptionPlans = () => {
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Edit / Create Form state
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '', price: '', currency: 'USD', duration_days: '30',
    max_staff_users: '', max_members: '', is_active: true
  });

  const fetchData = async () => {
    try {
      const headers = getHeaders();
      const pRes = await fetch('/api/platform/subscription-plans', { headers });

      if (pRes.ok) {
        setPlans(await pRes.json());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleEditClick = (p: any) => {
    setEditingId(p.id);
    setForm({
      name: p.name,
      price: p.price.toString(),
      currency: p.currency,
      duration_days: p.duration_days.toString(),
      max_staff_users: p.max_staff_users ? p.max_staff_users.toString() : '',
      max_members: p.max_members ? p.max_members.toString() : '',
      is_active: p.is_active
    });
    setShowModal(true);
  };

  const handleCreateClick = () => {
    setEditingId(null);
    setForm({
      name: '', price: '', currency: 'USD', duration_days: '30',
      max_staff_users: '', max_members: '', is_active: true
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      name: form.name,
      price: parseFloat(form.price),
      currency: form.currency,
      duration_days: parseInt(form.duration_days),
      max_staff_users: form.max_staff_users ? parseInt(form.max_staff_users) : null,
      max_members: form.max_members ? parseInt(form.max_members) : null,
      is_active: form.is_active
    };

    const url = editingId ? `/api/platform/subscription-plans/${editingId}` : '/api/platform/subscription-plans';
    const method = editingId ? 'PATCH' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: getHeaders(),
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        setShowModal(false);
        fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this subscription plan?')) return;
    try {
      const res = await fetch(`/api/platform/subscription-plans/${id}`, {
        method: 'DELETE',
        headers: getHeaders()
      });
      if (res.ok) {
        fetchData();
      } else {
        const err = await res.json();
        alert(err.message || 'Deletion failed.');
      }
    } catch (e) {
      console.error(e);
    }
  };



  if (loading) {
    return <div className="text-center" style={{ padding: '80px 0' }}><RefreshCw className="spin" size={32} /></div>;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h2 style={{ fontSize: '24px', fontWeight: 'bold', color: 'var(--text-primary)' }}>Subscription Plans</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Tier systems and usage quotas configuration</p>
        </div>
        <button onClick={handleCreateClick} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Plus size={16} />
          <span>Add New Plan</span>
        </button>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <table className="table">
          <thead>
            <tr>
              <th>Plan Name</th>
              <th>Price</th>
              <th>Duration (Days)</th>
              <th>Max Staff Limit</th>
              <th>Max Members Limit</th>
              <th>Status</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {plans.map(p => (
              <tr key={p.id}>
                <td style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{p.name}</td>
                <td>{p.price} {p.currency}</td>
                <td>{p.duration_days} days</td>
                <td>{p.max_staff_users ? `${p.max_staff_users} staff` : <span style={{ color: 'var(--text-muted)' }}>Unlimited</span>}</td>
                <td>{p.max_members ? `${p.max_members} members` : <span style={{ color: 'var(--text-muted)' }}>Unlimited</span>}</td>
                <td>
                  <span className={`badge ${p.is_active ? 'badge-active' : 'badge-inactive'}`}>
                    {p.is_active ? 'active' : 'inactive'}
                  </span>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button onClick={() => handleEditClick(p)} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }}>
                      Edit
                    </button>
                    <button 
                      onClick={() => handleDelete(p.id)} 
                      className="btn btn-secondary" 
                      style={{ padding: '6px 12px', fontSize: '12px', color: 'var(--status-offline)', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* CREATE/EDIT MODAL */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '500px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 'bold' }}>{editingId ? 'Edit Plan' : 'Create Subscription Plan'}</h3>
              <button onClick={() => setShowModal(false)} className="btn btn-secondary" style={{ padding: '4px 8px' }}>&times;</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">Plan Name</label>
                <input 
                  type="text" 
                  className="form-input" 
                  required 
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Starter Plan"
                />
              </div>
              <div className="grid grid-2">
                <div className="form-group">
                  <label className="form-label">Price</label>
                  <input 
                    type="number" 
                    step="0.01"
                    className="form-input" 
                    required 
                    value={form.price}
                    onChange={e => setForm({ ...form, price: e.target.value })}
                    placeholder="e.g. 49.99"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Currency</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    required 
                    maxLength={3}
                    value={form.currency}
                    onChange={e => setForm({ ...form, currency: e.target.value })}
                  />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Duration (Days)</label>
                <input 
                  type="number" 
                  className="form-input" 
                  required 
                  value={form.duration_days}
                  onChange={e => setForm({ ...form, duration_days: e.target.value })}
                  placeholder="30"
                />
              </div>
              <div className="grid grid-2">
                <div className="form-group">
                  <label className="form-label">Max Staff (Leave blank for Unlimited)</label>
                  <input 
                    type="number" 
                    className="form-input" 
                    value={form.max_staff_users}
                    onChange={e => setForm({ ...form, max_staff_users: e.target.value })}
                    placeholder="Unlimited"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Max Members (Leave blank for Unlimited)</label>
                  <input 
                    type="number" 
                    className="form-input" 
                    value={form.max_members}
                    onChange={e => setForm({ ...form, max_members: e.target.value })}
                    placeholder="Unlimited"
                  />
                </div>
              </div>

              <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input 
                  type="checkbox" 
                  checked={form.is_active}
                  onChange={e => setForm({ ...form, is_active: e.target.checked })}
                  style={{ accentColor: 'var(--accent-purple)' }}
                />
                <span style={{ fontSize: '13px' }}>Is Active (Available for Licensing)</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                <button type="button" onClick={() => setShowModal(false)} className="btn btn-secondary">Cancel</button>
                <button type="submit" className="btn btn-primary">
                  {editingId ? 'Save Changes' : 'Create Plan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};


// ==========================================
// 4. IMPERSONATION LOGS AUDIT TRAIL
// ==========================================
export const PlatformImpersonationLogs = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const res = await fetch('/api/platform/impersonation-logs', { headers: getHeaders() });
        if (res.ok) {
          setLogs(await res.json());
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchLogs();
  }, []);

  if (loading) {
    return <div className="text-center" style={{ padding: '80px 0' }}><RefreshCw className="spin" size={32} /></div>;
  }

  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '24px', fontWeight: 'bold', color: 'var(--text-primary)' }}>Impersonation Session Logs</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Audit log records tracking admin session masquerades</p>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <table className="table">
          <thead>
            <tr>
              <th>Super Admin</th>
              <th>Gym Target</th>
              <th>Impersonated User</th>
              <th>Reason Justification</th>
              <th>Started At</th>
              <th>Ended At</th>
            </tr>
          </thead>
          <tbody>
            {logs.map(log => (
              <tr key={log.id}>
                <td>{log.super_admin?.email}</td>
                <td>
                  <div style={{ fontWeight: '600' }}>{log.tenant?.name}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{log.tenant?.slug}</div>
                </td>
                <td>{log.impersonated_user?.name}</td>
                <td>
                  <div style={{ fontStyle: 'italic', color: 'var(--text-primary)', maxWidth: '300px', whiteSpace: 'normal', wordBreak: 'break-word' }}>
                    &ldquo;{log.reason}&rdquo;
                  </div>
                </td>
                <td>{new Date(log.started_at).toLocaleString()}</td>
                <td>{log.ended_at ? new Date(log.ended_at).toLocaleString() : (
                  <span style={{ color: '#d97706', fontWeight: 'bold' }}>Active session</span>
                )}</td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>No audit logs recorded.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
