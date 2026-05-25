import { useEffect, useState, useCallback } from 'react'
import { healthDetailed, updateLineWebhook } from '../api'
import { Activity, RefreshCw, Copy, Check, RotateCcw, Link } from 'lucide-react'
import { useToast } from './Toast'

interface ServiceStatus {
  gateway: 'ok' | 'error' | 'loading'
  line: 'connected' | 'disconnected' | 'loading'
  tunnel: 'running' | 'stopped' | 'loading'
  tunnelUrl: string | null
  configServer: 'ok' | 'error' | 'loading'
}

function Dot({ state }: { state: 'ok' | 'connected' | 'running' | 'error' | 'disconnected' | 'stopped' | 'loading' }) {
  if (state === 'loading') return <span className="w-2 h-2 rounded-full bg-slate-600 animate-pulse flex-shrink-0" />
  const good = state === 'ok' || state === 'connected' || state === 'running'
  return (
    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
      good ? 'bg-emerald-400 shadow-[0_0_5px_rgba(52,211,153,0.5)]' : 'bg-red-400 shadow-[0_0_5px_rgba(248,113,113,0.4)]'
    }`} />
  )
}

export function StatusBar() {
  const [status, setStatus] = useState<ServiceStatus>({
    gateway: 'loading', line: 'loading', tunnel: 'loading', tunnelUrl: null, configServer: 'loading'
  })
  const [checking, setChecking] = useState(false)
  const [lastChecked, setLastChecked] = useState<Date | null>(null)
  const [copied, setCopied] = useState(false)
  const [restarting, setRestarting] = useState(false)
  const [syncingLine, setSyncingLine] = useState(false)
  const { toast } = useToast()

  const restartGateway = async () => {
    setRestarting(true)
    try {
      await fetch('/config-api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restart: true }),
      })
      toast('Gateway restarting…', 'info')
      setTimeout(() => { check(); setRestarting(false) }, 5000)
    } catch {
      setRestarting(false)
      toast('Failed to restart gateway', 'error')
    }
  }

  const syncLineWebhook = async () => {
    if (!status.tunnelUrl) return
    setSyncingLine(true)
    try {
      const webhookUrl = `${status.tunnelUrl}/line/webhook`
      const result = await updateLineWebhook(webhookUrl)
      if (result.ok) {
        toast('LINE webhook updated!', 'success')
      } else {
        toast(`LINE sync failed: ${result.error}`, 'error')
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : 'LINE sync failed', 'error')
    } finally {
      setSyncingLine(false)
    }
  }

  const check = useCallback(async () => {
    setChecking(true)
    const next: ServiceStatus = { gateway: 'error', line: 'disconnected', tunnel: 'stopped', tunnelUrl: null, configServer: 'error' }

    await Promise.all([
      // Gateway + LINE
      healthDetailed().then(d => {
        next.gateway = d.gateway_state === 'running' ? 'ok' : 'error'
        next.line = d.platforms?.line?.state === 'connected' ? 'connected' : 'disconnected'
      }).catch(() => {}),

      // Tunnel status from config-server
      fetch('/config-api/tunnel-status').then(r => r.json()).then(d => {
        next.tunnel = d.running ? 'running' : 'stopped'
        next.tunnelUrl = d.tunnelUrl ?? null
      }).catch(() => {}),

      // Config server (just reaching /config-api/tunnel-status above proves it's up)
      fetch('/config-api/config').then(r => r.ok ? (next.configServer = 'ok') : null).catch(() => {}),
    ])

    setStatus(next)
    setLastChecked(new Date())
    setChecking(false)
  }, [])

  useEffect(() => {
    check()
    const interval = setInterval(check, 30000)
    return () => clearInterval(interval)
  }, [check])

  const copyUrl = () => {
    if (!status.tunnelUrl) return
    navigator.clipboard.writeText(`${status.tunnelUrl}/line/webhook`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const services = [
    { label: 'Gateway', state: status.gateway },
    { label: 'LINE', state: status.line },
    { label: 'Config', state: status.configServer },
  ] as const

  return (
    <div className="flex items-center gap-3 px-4 py-1.5 bg-[#0d0d14] border-b border-slate-800/60 min-w-0">
      {/* Brand */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <Activity size={13} className="text-indigo-400" />
        <span className="text-xs font-semibold text-slate-300 tracking-wider uppercase">Hermes Agent</span>
      </div>

      <div className="h-3.5 w-px bg-slate-700/60 flex-shrink-0" />

      {/* Service dots */}
      <div className="flex items-center gap-4">
        {services.map(s => (
          <div key={s.label} className="flex items-center gap-1.5">
            <Dot state={s.state} />
            <span className={`text-xs ${
              s.state === 'loading' ? 'text-slate-500'
              : s.state === 'ok' || s.state === 'connected' ? 'text-slate-300'
              : 'text-red-400'
            }`}>{s.label}</span>
          </div>
        ))}
      </div>

      <div className="h-3.5 w-px bg-slate-700/60 flex-shrink-0" />

      {/* Tunnel */}
      <div className="flex items-center gap-1.5 min-w-0">
        <Dot state={status.tunnel} />
        <span className={`text-xs flex-shrink-0 ${status.tunnel === 'running' ? 'text-slate-300' : 'text-red-400'}`}>
          Tunnel
        </span>
        {status.tunnelUrl ? (
          <span className="text-xs font-mono text-slate-500 truncate max-w-[200px]" title={status.tunnelUrl}>
            {status.tunnelUrl.replace('https://', '')}
          </span>
        ) : (
          <span className="text-xs text-slate-600">no URL</span>
        )}
        {status.tunnelUrl && (
          <>
            <button
              onClick={copyUrl}
              title="Copy webhook URL"
              className="flex-shrink-0 p-0.5 text-slate-600 hover:text-slate-300 transition-colors cursor-pointer"
            >
              {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
            </button>
            <button
              onClick={syncLineWebhook}
              disabled={syncingLine}
              title="Sync webhook URL to LINE"
              className="flex-shrink-0 p-0.5 text-slate-600 hover:text-green-400 disabled:opacity-40 transition-colors cursor-pointer"
            >
              <Link size={11} className={syncingLine ? 'animate-pulse text-green-400' : ''} />
            </button>
          </>
        )}
      </div>

      {/* Right side */}
      <div className="ml-auto flex items-center gap-3 flex-shrink-0">
        {lastChecked && (
          <span className="text-xs text-slate-700">{lastChecked.toLocaleTimeString()}</span>
        )}
        <button
          onClick={restartGateway}
          disabled={restarting}
          title="Restart gateway"
          className="flex items-center gap-1 text-xs text-slate-600 hover:text-amber-400 transition-colors cursor-pointer disabled:opacity-40"
        >
          <RotateCcw size={11} className={restarting ? 'animate-spin' : ''} />
        </button>
        <button
          onClick={check}
          disabled={checking}
          title="Refresh status"
          className="flex items-center gap-1 text-xs text-slate-600 hover:text-slate-400 transition-colors cursor-pointer disabled:opacity-40"
        >
          <RefreshCw size={11} className={checking ? 'animate-spin' : ''} />
        </button>
      </div>
    </div>
  )
}
