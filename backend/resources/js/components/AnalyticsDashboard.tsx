import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Briefcase,
  CreditCard,
  DollarSign,
  TrendingUp,
  Users,
} from 'lucide-react';

const apiRequest = async (path: string, method: string = 'GET', body: any = null) => {
  const token = localStorage.getItem('gym_auth_token');
  const headers: any = {
    Accept: 'application/json',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (body) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null,
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  return { status: response.status, data };
};

const money = (value: number | undefined | null) =>
  `$${(Number(value) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatHour = (hour: number) => {
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h}:00 ${suffix}`;
};

type SeriesPoint = { label: string; value: number };

const BarSeries = ({
  points,
  emptyLabel = 'No data in selected range',
  formatValue = (v: number) => String(v),
}: {
  points: SeriesPoint[];
  emptyLabel?: string;
  formatValue?: (v: number) => string;
}) => {
  const max = Math.max(...points.map((p) => p.value), 0);
  if (!points.length) {
    return <div className="analytics-empty">{emptyLabel}</div>;
  }

  return (
    <div className="analytics-bars">
      {points.map((point) => {
        const pct = max > 0 ? Math.round((point.value / max) * 100) : 0;
        return (
          <div key={point.label} className="analytics-bar-row">
            <div className="analytics-bar-label" title={point.label}>
              {point.label}
            </div>
            <div className="analytics-bar-track">
              <div className="analytics-bar-fill" style={{ width: `${pct}%` }} />
            </div>
            <div className="analytics-bar-value">{formatValue(point.value)}</div>
          </div>
        );
      })}
    </div>
  );
};

const SectionCard = ({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) => (
  <div className="card analytics-section">
    <div className="analytics-section-header">
      <h3>{title}</h3>
      {subtitle ? <p>{subtitle}</p> : null}
    </div>
    {children}
  </div>
);

export const AnalyticsDashboard = () => {
  const [filter, setFilter] = useState({
    from: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().split('T')[0],
    to: new Date().toISOString().split('T')[0],
    group_by: 'day',
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState<any>(null);

  const loadAnalytics = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiRequest(
        `/api/analytics/summary?from=${filter.from}&to=${filter.to}&group_by=${filter.group_by}`
      );
      if (res.status === 200) {
        setData(res.data);
      } else if (res.status === 403) {
        setError('You do not have permission to view analytics.');
        setData(null);
      } else {
        setError(res.data?.message || 'Failed to load analytics.');
        setData(null);
      }
    } catch (e) {
      console.error(e);
      setError('Failed to load analytics.');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnalytics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const members = data?.members;
  const plans = data?.plans;
  const attendance = data?.attendance;
  const finance = data?.finance;
  const hr = data?.hr;

  const signupSeries: SeriesPoint[] = useMemo(
    () => (members?.new_signups || []).map((r: any) => ({ label: r.period, value: r.count })),
    [members]
  );

  const checkinSeries: SeriesPoint[] = useMemo(
    () => (attendance?.by_period || []).map((r: any) => ({ label: r.period, value: r.count })),
    [attendance]
  );

  const peakHourSeries: SeriesPoint[] = useMemo(
    () =>
      (attendance?.peak_hours || []).map((r: any) => ({
        label: formatHour(r.hour),
        value: r.count,
      })),
    [attendance]
  );

  const revenueSeries: SeriesPoint[] = useMemo(
    () =>
      (finance?.revenue_by_period || []).map((r: any) => ({
        label: r.period,
        value: Number(r.total_amount) || 0,
      })),
    [finance]
  );

  const expenseCategorySeries: SeriesPoint[] = useMemo(
    () =>
      Object.entries(finance?.expenses_by_category || {}).map(([label, value]) => ({
        label,
        value: Number(value) || 0,
      })),
    [finance]
  );

  const methodSeries: SeriesPoint[] = useMemo(
    () =>
      Object.entries(finance?.revenue_by_method || {}).map(([label, value]) => ({
        label,
        value: Number(value) || 0,
      })),
    [finance]
  );

  const planSeries: SeriesPoint[] = useMemo(
    () =>
      (plans?.popular_plans || []).map((r: any) => ({
        label: r.plan_name,
        value: r.active_count,
      })),
    [plans]
  );

  const agingSeries: SeriesPoint[] = useMemo(() => {
    const aging = finance?.outstanding?.aging || {};
    return [
      { label: 'Current', value: Number(aging.current) || 0 },
      { label: '1–30 days', value: Number(aging.days_1_30) || 0 },
      { label: '31–60 days', value: Number(aging.days_31_60) || 0 },
      { label: '60+ days', value: Number(aging.days_60_plus) || 0 },
    ];
  }, [finance]);

  return (
    <div style={{ animation: 'fadeIn 0.2s ease-out' }}>
      <div className="header-bar">
        <div className="header-title">
          <h1>Analytics</h1>
          <p>Membership, attendance, finance, and HR performance for this gym</p>
        </div>
      </div>

      <div className="card analytics-filters">
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">From</label>
          <input
            type="date"
            className="form-input"
            value={filter.from}
            onChange={(e) => setFilter({ ...filter, from: e.target.value })}
          />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">To</label>
          <input
            type="date"
            className="form-input"
            value={filter.to}
            onChange={(e) => setFilter({ ...filter, to: e.target.value })}
          />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Group by</label>
          <select
            className="form-select"
            value={filter.group_by}
            onChange={(e) => setFilter({ ...filter, group_by: e.target.value })}
          >
            <option value="day">Day</option>
            <option value="week">Week</option>
            <option value="month">Month</option>
          </select>
        </div>
        <button className="btn btn-primary" onClick={loadAnalytics} disabled={loading}>
          {loading ? 'Loading…' : 'Apply range'}
        </button>
      </div>

      {error && (
        <div
          style={{
            backgroundColor: 'var(--status-inactive-bg)',
            color: 'var(--status-inactive)',
            padding: '12px 16px',
            borderRadius: '10px',
            marginBottom: '20px',
            fontSize: '13px',
          }}
        >
          {error}
        </div>
      )}

      {loading && !data ? (
        <div className="analytics-empty">Loading analytics…</div>
      ) : data ? (
        <>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon">
                <Users size={20} />
              </div>
              <div className="stat-info">
                <div className="stat-label">Members</div>
                <div className="stat-value">{members?.total ?? 0}</div>
                <div className="stat-sub">
                  {members?.by_status?.Active ?? 0} active · {members?.by_status?.Frozen ?? 0} frozen ·{' '}
                  {members?.by_status?.Inactive ?? 0} inactive
                </div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon">
                <Activity size={20} />
              </div>
              <div className="stat-info">
                <div className="stat-label">Check-ins today</div>
                <div className="stat-value">{attendance?.today ?? 0}</div>
                <div className="stat-sub">
                  {attendance?.period_total ?? 0} in range · {attendance?.unique_members ?? 0} unique
                </div>
              </div>
            </div>

            <div className="stat-card">
              <div
                className="stat-icon"
                style={{ backgroundColor: 'var(--status-active-bg)', color: 'var(--status-active)' }}
              >
                <DollarSign size={20} />
              </div>
              <div className="stat-info">
                <div className="stat-label">Period revenue</div>
                <div className="stat-value">{money(finance?.revenue_total)}</div>
                <div className="stat-sub">Net {money(finance?.net)} after expenses</div>
              </div>
            </div>

            <div className="stat-card">
              <div
                className="stat-icon"
                style={{ backgroundColor: 'var(--status-offline-bg)', color: 'var(--status-offline)' }}
              >
                <AlertTriangle size={20} />
              </div>
              <div className="stat-info">
                <div className="stat-label">Outstanding AR</div>
                <div className="stat-value">{money(finance?.outstanding?.total_amount)}</div>
                <div className="stat-sub">{finance?.outstanding?.invoice_count ?? 0} open invoices</div>
              </div>
            </div>
          </div>

          <div className="analytics-grid">
            <SectionCard title="Membership" subtitle="Status mix and new signups in range">
              <div className="stats-grid" style={{ marginBottom: '20px' }}>
                <div className="stat-card">
                  <div className="stat-info">
                    <div className="stat-label">Active</div>
                    <div className="stat-value" style={{ color: 'var(--status-active)' }}>
                      {members?.by_status?.Active ?? 0}
                    </div>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-info">
                    <div className="stat-label">Frozen</div>
                    <div className="stat-value" style={{ color: 'var(--status-frozen)' }}>
                      {members?.by_status?.Frozen ?? 0}
                    </div>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-info">
                    <div className="stat-label">Inactive</div>
                    <div className="stat-value" style={{ color: 'var(--status-inactive)' }}>
                      {members?.by_status?.Inactive ?? 0}
                    </div>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-info">
                    <div className="stat-label">New signups</div>
                    <div className="stat-value">{members?.new_signups_total ?? 0}</div>
                  </div>
                </div>
              </div>
              <BarSeries points={signupSeries} emptyLabel="No new members in this range" />
            </SectionCard>

            <SectionCard title="Plans" subtitle="Active subscriptions and plans nearing expiry">
              <div className="stats-grid" style={{ marginBottom: '20px' }}>
                <div className="stat-card">
                  <div className="stat-info">
                    <div className="stat-label">Active subs</div>
                    <div className="stat-value">{plans?.subscriptions_by_status?.active ?? 0}</div>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-info">
                    <div className="stat-label">Frozen subs</div>
                    <div className="stat-value">{plans?.subscriptions_by_status?.frozen ?? 0}</div>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-info">
                    <div className="stat-label">Expired</div>
                    <div className="stat-value">{plans?.subscriptions_by_status?.expired ?? 0}</div>
                  </div>
                </div>
                <div className="stat-card">
                  <div
                    className="stat-icon"
                    style={{ backgroundColor: 'var(--status-offline-bg)', color: 'var(--status-offline)' }}
                  >
                    <CreditCard size={18} />
                  </div>
                  <div className="stat-info">
                    <div className="stat-label">Expiring ≤14 days</div>
                    <div className="stat-value">{plans?.expiring_soon ?? 0}</div>
                  </div>
                </div>
              </div>
              <h4 className="analytics-subtitle">Popular active plans</h4>
              <BarSeries points={planSeries} emptyLabel="No active plan subscriptions" />
            </SectionCard>

            <SectionCard title="Attendance" subtitle="Check-in volume and peak hours">
              <h4 className="analytics-subtitle">Check-ins over time</h4>
              <BarSeries points={checkinSeries} emptyLabel="No check-ins in this range" />
              <h4 className="analytics-subtitle" style={{ marginTop: '24px' }}>
                Peak hours
              </h4>
              <BarSeries points={peakHourSeries} emptyLabel="No hourly pattern yet" />
              {attendance?.by_method && Object.keys(attendance.by_method).length > 0 && (
                <>
                  <h4 className="analytics-subtitle" style={{ marginTop: '24px' }}>
                    By method
                  </h4>
                  <div className="analytics-chip-row">
                    {Object.entries(attendance.by_method).map(([method, count]) => (
                      <span key={method} className="analytics-chip">
                        {method}: <strong>{String(count)}</strong>
                      </span>
                    ))}
                  </div>
                </>
              )}
            </SectionCard>

            <SectionCard title="Finance" subtitle="Revenue, expenses, and receivables">
              <div className="stats-grid" style={{ marginBottom: '20px' }}>
                <div className="stat-card">
                  <div className="stat-info">
                    <div className="stat-label">Revenue</div>
                    <div className="stat-value">{money(finance?.revenue_total)}</div>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-info">
                    <div className="stat-label">Expenses</div>
                    <div className="stat-value">{money(finance?.expenses_total)}</div>
                  </div>
                </div>
                <div className="stat-card">
                  <div
                    className="stat-icon"
                    style={{
                      backgroundColor:
                        (finance?.net ?? 0) >= 0 ? 'var(--status-active-bg)' : 'var(--status-inactive-bg)',
                      color: (finance?.net ?? 0) >= 0 ? 'var(--status-active)' : 'var(--status-inactive)',
                    }}
                  >
                    <TrendingUp size={18} />
                  </div>
                  <div className="stat-info">
                    <div className="stat-label">Net</div>
                    <div
                      className="stat-value"
                      style={{
                        color: (finance?.net ?? 0) >= 0 ? 'var(--status-active)' : 'var(--status-inactive)',
                      }}
                    >
                      {money(finance?.net)}
                    </div>
                  </div>
                </div>
              </div>
              <h4 className="analytics-subtitle">Revenue over time</h4>
              <BarSeries points={revenueSeries} formatValue={money} emptyLabel="No payments in this range" />
              <h4 className="analytics-subtitle" style={{ marginTop: '24px' }}>
                Revenue by method
              </h4>
              <BarSeries points={methodSeries} formatValue={money} emptyLabel="No payment methods recorded" />
              <h4 className="analytics-subtitle" style={{ marginTop: '24px' }}>
                Expenses by category
              </h4>
              <BarSeries
                points={expenseCategorySeries}
                formatValue={money}
                emptyLabel="No expenses in this range"
              />
              <h4 className="analytics-subtitle" style={{ marginTop: '24px' }}>
                Outstanding aging
              </h4>
              <BarSeries points={agingSeries} formatValue={money} />
            </SectionCard>

            <SectionCard title="HR" subtitle="Headcount, leave, and payroll in range">
              <div className="stats-grid" style={{ marginBottom: '20px' }}>
                <div className="stat-card">
                  <div className="stat-icon">
                    <Briefcase size={18} />
                  </div>
                  <div className="stat-info">
                    <div className="stat-label">Headcount</div>
                    <div className="stat-value">{hr?.headcount?.total ?? 0}</div>
                    <div className="stat-sub">
                      {hr?.headcount?.active ?? 0} active · {hr?.headcount?.on_leave ?? 0} on leave
                    </div>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-info">
                    <div className="stat-label">Leave pending</div>
                    <div className="stat-value">{hr?.leave?.pending ?? 0}</div>
                    <div className="stat-sub">
                      {hr?.leave?.approved ?? 0} approved · {hr?.leave?.rejected ?? 0} rejected
                    </div>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-info">
                    <div className="stat-label">Payroll net (range)</div>
                    <div className="stat-value">{money(hr?.payroll?.total_net_pay)}</div>
                    <div className="stat-sub">{hr?.payroll?.runs_in_period ?? 0} runs overlapping range</div>
                  </div>
                </div>
              </div>
              {hr?.by_employment_type && Object.keys(hr.by_employment_type).length > 0 && (
                <>
                  <h4 className="analytics-subtitle">Employment type</h4>
                  <div className="analytics-chip-row">
                    {Object.entries(hr.by_employment_type).map(([type, count]) => (
                      <span key={type} className="analytics-chip">
                        {type}: <strong>{String(count)}</strong>
                      </span>
                    ))}
                  </div>
                </>
              )}
            </SectionCard>
          </div>
        </>
      ) : null}
    </div>
  );
};

export default AnalyticsDashboard;
