const IS_DEV = import.meta.env.DEV
const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL ?? ''
const CONFIG_URL = import.meta.env.VITE_CONFIG_URL ?? ''

// In dev: Vite proxy forwards to localhost. In prod: use env var URLs.
const BASE = IS_DEV ? '' : GATEWAY_URL
export const CONFIG_BASE = IS_DEV ? '' : CONFIG_URL

// ── Health ──────────────────────────────────────────────────────────────────

export async function healthCheck(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(4000) })
    return res.ok
  } catch {
    return false
  }
}

export interface HealthDetailed {
  status: string
  platform: string
  gateway_state: string
  platforms: Record<string, { state: string; error_code: string | null; error_message: string | null; updated_at: string }>
  active_agents: number
  pid: number
  updated_at: string
}

export async function healthDetailed(): Promise<HealthDetailed> {
  const res = await fetch(`${BASE}/health/detailed`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

// ── Chat (OpenAI-compatible) ─────────────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface ChatResponse {
  id: string
  object: string
  created: number
  model: string
  choices: Array<{
    index: number
    message: ChatMessage
    finish_reason: string
  }>
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

// ── Runs API (with real stop + SSE progress) ─────────────────────────────────

export interface RunEvent {
  event: string
  run_id?: string
  delta?: string
  tool?: string
  name?: string
  preview?: string
  output?: string
  timestamp?: number
  error?: string
  [key: string]: unknown
}

export interface RunResult {
  run_id: string
  output: string
}

export async function startRun(
  messages: ChatMessage[],
  model = 'hermes-agent',
  signal?: AbortSignal
): Promise<{ run_id: string }> {
  const input = messages.map(m => ({ role: m.role, content: m.content }))
  const res = await fetch(`${BASE}/v1/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, input }),
    signal,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`HTTP ${res.status}: ${text}`)
  }
  return res.json()
}

export function streamRunEvents(
  runId: string,
  onEvent: (e: RunEvent) => void,
  signal?: AbortSignal,
  onError?: (err: Error) => void
): () => void {
  const es = new EventSource(`${BASE}/v1/runs/${runId}/events`)

  es.onmessage = (msg) => {
    try {
      const data: RunEvent = JSON.parse(msg.data)
      onEvent(data)
    } catch { /* ignore malformed */ }
  }

  es.onerror = () => {
    es.close()
    onError?.(new Error('Stream connection lost'))
  }

  signal?.addEventListener('abort', () => es.close())

  return () => es.close()
}

// ── Models ────────────────────────────────────────────────────────────────────

export interface Model {
  id: string
  object: string
  owned_by: string
}

export async function getModels(): Promise<Model[]> {
  const res = await fetch(`${BASE}/v1/models`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  return data.data ?? []
}

// ── Capabilities ──────────────────────────────────────────────────────────────

export interface Capabilities {
  api_version?: string
  endpoints?: Record<string, { method: string; path: string }>
  features?: Record<string, boolean>
  [key: string]: unknown
}

export async function getCapabilities(): Promise<Capabilities> {
  const res = await fetch(`${BASE}/v1/capabilities`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

// ── Jobs (Scheduled tasks) ────────────────────────────────────────────────────

export interface Job {
  id: string
  name?: string
  schedule?: string
  status?: string
  last_run?: string
  next_run?: string
  [key: string]: unknown
}

export async function getJobs(): Promise<Job[]> {
  const res = await fetch(`${BASE}/api/jobs`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  return Array.isArray(data) ? data : data.jobs ?? []
}

export async function createJob(job: Partial<Job>): Promise<Job> {
  const res = await fetch(`${BASE}/api/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(job),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function updateJob(jobId: string, patch: Partial<Job>): Promise<Job> {
  const res = await fetch(`${BASE}/api/jobs/${jobId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  return data.job ?? data
}

export async function deleteJob(jobId: string): Promise<void> {
  const res = await fetch(`${BASE}/api/jobs/${jobId}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
}

// ── Runs ──────────────────────────────────────────────────────────────────────

export interface Run {
  run_id: string
  status?: string
  created_at?: string
  [key: string]: unknown
}

export async function getRun(runId: string): Promise<Run> {
  const res = await fetch(`${BASE}/v1/runs/${runId}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function stopRun(runId: string): Promise<void> {
  const res = await fetch(`${BASE}/v1/runs/${runId}/stop`, { method: 'POST' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
}

// ── Platforms (from health/detailed) ─────────────────────────────────────────

export async function getPlatforms(): Promise<Array<{ name: string; state: string; error: string | null; updated_at: string }>> {
  const data = await healthDetailed()
  return Object.entries(data.platforms ?? {}).map(([name, info]) => ({
    name,
    state: info.state,
    error: info.error_message,
    updated_at: info.updated_at,
  }))
}

// ── Sessions (local — read from filesystem via chat history in same session) ──
// Hermes doesn't expose a /sessions REST endpoint. We track sessions client-side.

export interface Session {
  id: string
  label: string
  created_at: string
  messages: ChatMessage[]
}

// ── Logs (via config-server) ──────────────────────────────────────────────────

// ── LINE Webhook ──────────────────────────────────────────────────────────────

export async function updateLineWebhook(webhookUrl: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`${CONFIG_BASE}/config-api/update-line-webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ webhookUrl }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

// ── Logs (via config-server) ──────────────────────────────────────────────────

export async function getLogs(source: 'gateway' | 'cloudflared' | 'configserver' = 'gateway', lines = 200): Promise<{ lines: string[]; total: number }> {
  const res = await fetch(`${CONFIG_BASE}/config-api/logs?source=${source}&lines=${lines}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

// ── LINE Push Notification ────────────────────────────────────────────────

export async function sendLineMessage(message: string, to?: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`${CONFIG_BASE}/config-api/send-line`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, to }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

// ── KIE Image Generation ──────────────────────────────────────────────────────

export async function generateImage(prompt: string, aspect_ratio = 'auto', resolution = '1K'): Promise<{ ok: boolean; taskId?: string; error?: string }> {
  const res = await fetch(`${CONFIG_BASE}/config-api/generate-image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, aspect_ratio, resolution }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function getImageStatus(taskId: string): Promise<{
  code: number
  data?: {
    state: 'waiting' | 'queuing' | 'generating' | 'success' | 'fail'
    progress: number
    resultJson?: string
    failMsg?: string
  }
}> {
  const res = await fetch(`${CONFIG_BASE}/config-api/image-status?taskId=${encodeURIComponent(taskId)}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

// ── Skills (via config-server) ────────────────────────────────────────────────

export interface Skill {
  id: string
  category: string
  name: string
  description: string
  version: string | null
  tags: string[]
}

export async function getSkills(): Promise<Skill[]> {
  const res = await fetch(`${CONFIG_BASE}/config-api/skills`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  return data.skills ?? []
}

// ── Memory files (via config-server) ─────────────────────────────────────────

export async function getMemoryFiles(): Promise<string[]> {
  const res = await fetch(`${CONFIG_BASE}/config-api/memory`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  return data.files ?? []
}

export async function getMemoryFile(filename: string): Promise<string> {
  const res = await fetch(`${CONFIG_BASE}/config-api/memory/${encodeURIComponent(filename)}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  return data.content ?? ''
}

export async function saveMemoryFile(filename: string, content: string): Promise<void> {
  const res = await fetch(`${CONFIG_BASE}/config-api/memory/${encodeURIComponent(filename)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
}
