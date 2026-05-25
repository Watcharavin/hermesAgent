import { useEffect, useState, useCallback, useRef } from 'react'
import { getLogs } from '../api'
import { ScrollText, RefreshCw, Trash2 } from 'lucide-react'

type LogSource = 'gateway' | 'cloudflared' | 'configserver'

const SOURCE_LABELS: Record<LogSource, string> = {
  gateway: 'Gateway',
  cloudflared: 'Tunnel',
  configserver: 'Config Server',
}

function colorLine(line: string): string {
  if (/ERROR|error|Exception|Traceback|CRITICAL/.test(line)) return 'text-red-400'
  if (/WARN|warn/.test(line)) return 'text-yellow-400'
  if (/INFO|info/.test(line)) return 'text-slate-300'
  if (/DEBUG|debug/.test(line)) return 'text-slate-600'
  if (/connected|running|started|success|ok/i.test(line)) return 'text-emerald-400'
  return 'text-slate-500'
}

export function LogsPanel() {
  const [source, setSource] = useState<LogSource>('gateway')
  const [lines, setLines] = useState<string[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [, setCleared] = useState(false)
  const clearedRef = useRef(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getLogs(source, 300)
      if (!clearedRef.current) {
        setLines(data.lines)
        setTotal(data.total)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load logs')
    } finally {
      setLoading(false)
    }
  }, [source])

  useEffect(() => { load() }, [load])

  // Auto-refresh every 5s
  useEffect(() => {
    const interval = setInterval(load, 5000)
    return () => clearInterval(interval)
  }, [load])

  useEffect(() => {
    if (autoScroll) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lines, autoScroll])

  return (
    <div className="flex flex-col h-full bg-[#0b0b12] border-l border-slate-800/60">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-800/60">
        <ScrollText size={13} className="text-indigo-400 flex-shrink-0" />
        <span className="text-xs font-medium text-slate-200">Logs</span>
        {total > 0 && (
          <span className="text-[10px] text-slate-600">{total} lines total</span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => { clearedRef.current = true; setCleared(true); setLines([]) }}
            title="Clear view"
            className="p-1.5 text-slate-600 hover:text-slate-400 transition-colors cursor-pointer"
          >
            <Trash2 size={11} />
          </button>
          <button
            onClick={() => { clearedRef.current = false; setCleared(false); load() }}
            disabled={loading}
            title="Refresh"
            className="p-1.5 text-slate-600 hover:text-slate-400 disabled:opacity-30 transition-colors cursor-pointer"
          >
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Source tabs */}
      <div className="flex border-b border-slate-800/40 px-1 pt-1 gap-0.5">
        {(Object.keys(SOURCE_LABELS) as LogSource[]).map(s => (
          <button
            key={s}
            onClick={() => { clearedRef.current = false; setSource(s); setCleared(false) }}
            className={`px-2.5 py-1.5 text-[10px] font-medium rounded-t-md transition-all cursor-pointer ${
              source === s
                ? 'bg-slate-800/80 text-slate-200 border-b-2 border-indigo-500 -mb-px'
                : 'text-slate-600 hover:text-slate-400'
            }`}
          >
            {SOURCE_LABELS[s]}
          </button>
        ))}
      </div>

      {/* Auto-scroll toggle */}
      <div className="flex items-center justify-end gap-2 px-3 py-1 border-b border-slate-800/30">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <button
            onClick={() => setAutoScroll(v => !v)}
            className={`w-6 h-3 rounded-full transition-colors relative flex-shrink-0 ${autoScroll ? 'bg-indigo-600' : 'bg-slate-700'}`}
          >
            <span className={`absolute top-0.5 w-2 h-2 rounded-full bg-white transition-all ${autoScroll ? 'left-3.5' : 'left-0.5'}`} />
          </button>
          <span className="text-[10px] text-slate-600">Auto-scroll</span>
        </label>
      </div>

      {error && (
        <div className="mx-2 mt-2 text-[10px] text-red-400 bg-red-500/10 border border-red-500/20 rounded px-2 py-1.5">
          {error}
        </div>
      )}

      {/* Log lines */}
      <div className="flex-1 overflow-y-auto px-2 py-2 font-mono text-[10px] leading-relaxed space-y-px">
        {lines.length === 0 && !loading && (
          <p className="text-slate-700 text-center py-8">No log lines</p>
        )}
        {lines.map((line, i) => (
          <div key={i} className={`whitespace-pre-wrap break-all ${colorLine(line)}`}>
            {line}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
