export interface RunRecord {
  id: string
  run_id: string
  model: string
  prompt_preview: string
  output_preview: string
  status: 'success' | 'error' | 'stopped'
  tokens: number
  duration_ms: number
  timestamp: string
  error?: string
}

const RUNS_KEY = 'hermes_run_history'
const MAX_RUNS = 300

export function loadRuns(): RunRecord[] {
  try { return JSON.parse(localStorage.getItem(RUNS_KEY) ?? '[]') }
  catch { return [] }
}

export function saveRun(run: RunRecord) {
  try {
    const runs = loadRuns()
    const next = [run, ...runs].slice(0, MAX_RUNS)
    localStorage.setItem(RUNS_KEY, JSON.stringify(next))
  } catch { /* quota */ }
}

export function clearRuns() {
  localStorage.removeItem(RUNS_KEY)
}

export interface DayStats {
  total: number
  successes: number
  errors: number
  tokens: number
}

export function getTodayStats(): DayStats {
  const runs = loadRuns()
  const today = new Date().toDateString()
  const todayRuns = runs.filter(r => new Date(r.timestamp).toDateString() === today)
  return {
    total: todayRuns.length,
    successes: todayRuns.filter(r => r.status === 'success').length,
    errors: todayRuns.filter(r => r.status === 'error').length,
    tokens: todayRuns.reduce((s, r) => s + (r.tokens || 0), 0),
  }
}
