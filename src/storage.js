const KEY = 'polePosition.records.v1';
const MAX = 10;

export function submitScore(scores, initials, score) {
  return [...scores, { initials, score: Math.round(score) }]
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX);
}

export function qualifies(scores, score) {
  return scores.length < MAX || score > scores[scores.length - 1].score;
}

// --- per-track records: { [trackName]: { scores, bestLap, ghost } } ---

const EMPTY = { scores: [], bestLap: null, ghost: null };

export function trackRecord(records, trackName) {
  return { ...EMPTY, ...(records[trackName] ?? {}) };
}

export function withTrackRecord(records, trackName, patch) {
  return { ...records, [trackName]: { ...trackRecord(records, trackName), ...patch } };
}

export function loadRecords() {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch { return {}; }
}

export function persistRecords(records) {
  try { localStorage.setItem(KEY, JSON.stringify(records)); } catch { /* session-only */ }
}
