export type SessionLimitType = 'unlimited' | 'total' | 'per_week' | 'per_month';

export function resolveSessionLimitType(plan: {
  session_limit_type?: string | null;
  session_limit?: number | null;
}): SessionLimitType {
  if (plan.session_limit_type === 'unlimited' || plan.session_limit_type === 'total'
    || plan.session_limit_type === 'per_week' || plan.session_limit_type === 'per_month') {
    return plan.session_limit_type;
  }
  return plan.session_limit == null ? 'unlimited' : 'total';
}

function startOfIsoWeek(d: Date): Date {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date;
}

function endOfIsoWeek(d: Date): Date {
  const end = startOfIsoWeek(d);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

/** Visits that count toward the plan's current limit window. */
export function sessionsUsedTowardLimit(
  plan: { session_limit_type?: string | null; session_limit?: number | null },
  sessionsUsedTotal: number,
  attendances: Array<{ member_plan_id?: string | null; checked_in_at: string }>,
  memberPlanId: string,
  at: Date = new Date(),
): number {
  const type = resolveSessionLimitType(plan);
  if (type === 'unlimited') return 0;
  if (type === 'total') return sessionsUsedTotal || 0;

  let start: Date;
  let end: Date;
  if (type === 'per_week') {
    start = startOfIsoWeek(at);
    end = endOfIsoWeek(at);
  } else {
    start = startOfMonth(at);
    end = endOfMonth(at);
  }

  return attendances.filter((a) => {
    if (a.member_plan_id !== memberPlanId) return false;
    const t = new Date(a.checked_in_at);
    return t >= start && t <= end;
  }).length;
}

export function isSessionLimitReached(
  plan: { session_limit_type?: string | null; session_limit?: number | null },
  sessionsUsedTotal: number,
  attendances: Array<{ member_plan_id?: string | null; checked_in_at: string }>,
  memberPlanId: string,
  at: Date = new Date(),
): boolean {
  const type = resolveSessionLimitType(plan);
  if (type === 'unlimited' || plan.session_limit == null) return false;
  return sessionsUsedTowardLimit(plan, sessionsUsedTotal, attendances, memberPlanId, at) >= plan.session_limit;
}

/** Only lifetime "total" punch cards expire the subscription when the cap is hit. */
export function shouldExpireOnSessionCap(plan: {
  session_limit_type?: string | null;
  session_limit?: number | null;
}): boolean {
  return resolveSessionLimitType(plan) === 'total' && plan.session_limit != null;
}

export function formatSessionLimitLabel(plan: {
  session_limit_type?: string | null;
  session_limit?: number | null;
}): string {
  const type = resolveSessionLimitType(plan);
  if (type === 'unlimited' || plan.session_limit == null) return 'Unlimited';
  if (type === 'per_week') return `${plan.session_limit}/week`;
  if (type === 'per_month') return `${plan.session_limit}/month`;
  return `${plan.session_limit} total`;
}
