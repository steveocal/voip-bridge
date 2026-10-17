// One inbound call lands in call_log several times: Asterisk's AGI logs the
// trunk leg (call_id "<epoch>.<seq>", did set, owns the recording), then
// every softphone that rang logs its own leg (SIP Call-ID, no did) a few
// seconds later. groupCallLegs finds which rows are legs of the same call;
// the call history folds each group into one row, and the Odoo push sends
// each group as one voip.call. Outgoing calls are only logged once.

type LegRow = Record<string, unknown>;
const LEG_SLACK_MS = 3000;

/** Rows newest first (as the history query returns them) → groups of legs,
 *  newest group first, each group's legs oldest first. */
export function groupCallLegs<T extends object>(rows: T[]): T[][] {
  type Group = { rows: T[]; end: number; trunk: boolean };
  const groups: Group[] = [];
  const latest = new Map<string, Group>();
  for (const row of [...rows].reverse()) {
    const r = row as LegRow;
    const start = Number(r.start_date) || 0;
    const end = Math.max(Number(r.end_date) || 0, start);
    const trunk = !!r.did;
    const key = String(r.phone_number || "").replace(/\D/g, "").slice(-9);
    const g = r.direction === "incoming" && key ? latest.get(key) : undefined;
    if (g && start <= g.end + LEG_SLACK_MS && !(trunk && g.trunk)) {
      g.rows.push(row); g.end = Math.max(g.end, end); g.trunk = g.trunk || trunk;
      continue;
    }
    const ng: Group = { rows: [row], end, trunk };
    groups.push(ng);
    if (r.direction === "incoming" && key) latest.set(key, ng);
  }
  return groups.reverse().map(g => g.rows);
}
