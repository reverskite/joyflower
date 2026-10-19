// Owner confirmed: an explicit reopening and new completion starts a new 3-month period.
// Preview only: this module never deletes data or schedules production work.
export type RetentionRecord = {
  status: string; created_at: number; status_updated_at: number | null; status_version: number;
};
export type RetentionChange = { next_status: string; changed_at: number };
export type RetentionDecision = {
  state: 'in_progress' | 'review_required' | 'retained' | 'expired';
  closedAt: number | null; expiresAt: number | null;
};

export function threeMonthsAfterKorea(timestamp: number) {
  if (!Number.isSafeInteger(timestamp) || timestamp < 0) throw new Error('Invalid completion date');
  const offset = 9 * 3_600_000;
  const date = new Date(timestamp + offset);
  const target = new Date(date);
  target.setUTCDate(1);
  target.setUTCMonth(target.getUTCMonth() + 3);
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(date.getUTCDate(), lastDay));
  return target.getTime() - offset;
}

export function inquiryRetention(row: RetentionRecord, latestChange?: RetentionChange, now = Date.now()): RetentionDecision {
  if (row.status === 'new' || row.status === 'reviewing') return { state: 'in_progress', closedAt: null, expiresAt: null };
  const closedAt = row.status_updated_at;
  if (row.status !== 'completed' || !Number.isSafeInteger(closedAt) || closedAt === null ||
      !Number.isSafeInteger(row.created_at) || closedAt < row.created_at || closedAt > now ||
      row.status_version < 1 || latestChange?.next_status !== 'completed' || latestChange.changed_at !== closedAt)
    return { state: 'review_required', closedAt: null, expiresAt: null };
  const expiresAt = threeMonthsAfterKorea(closedAt);
  return { state: now >= expiresAt ? 'expired' : 'retained', closedAt, expiresAt };
}
