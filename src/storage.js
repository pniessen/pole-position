const KEY = 'polePosition.scores';
const MAX = 10;

export function submitScore(scores, initials, score) {
  return [...scores, { initials, score: Math.round(score) }]
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX);
}

export function qualifies(scores, score) {
  return scores.length < MAX || score > scores[scores.length - 1].score;
}

export function loadScores() {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

export function persistScores(scores) {
  try { localStorage.setItem(KEY, JSON.stringify(scores)); } catch { /* session-only */ }
}
