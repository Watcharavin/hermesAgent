import { useEffect, useState } from 'react'
import { loadRuns, clearRuns, type RunRecord } from '../lib/runHistory'
import { CheckCircle, XCircle, StopCircle, Trash2, RefreshCw, Clock, Zap } from 'lucide-react'

interface Props {
  refreshKey: number
}

export function RunsPanel({ refreshKey }: Props) {
  const [runs, setRuns] = useState<RunRecord[]>([])
  const [filter, setFilter] = useState<'all' | 'success' | 'error'>('all')

  const reload = () => setRuns(loadRuns())

  useEffect(() => { reload() }, [refreshKey])

  const filtered = filter === 'all' ? runs : runs.filter(r => r.status === filter)

  const handleClear = () => {
    clearRuns()
    setRuns([])
  }

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`
    return `${(ms / 1000).toFixed(1)}s`
  }

  const formatTime = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const statusIcon = (status: RunRecord['status']) => {
    if (status === 'success') return <CheckCircle size={11} className="text-emerald-400 flex-shrink-0" />
    if (status === 'error') return <XCircle size={11} className="text-red-400 flex-shrink-0" />
    return <StopCircle size={11} className="text-slate-500 flex-shrink-0" />
  }

  const todayStr = new Date().toDateString()
  const todayRuns = runs.filter(r => new Date(r.timestamp).toDateString() === todayStr)
  const successRate = todayRuns.length > 0
    ? Math.round((todayRuns.filter(r => r.status === 'success').length / todayRuns.length) * 100)
    : 0

  return (
    <div className="flex flex-col h-full bg-[#0b0b12] border-l border-slate-800/60">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-slate-800/60">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium text-slate-300">Run History</p>
          <div className="flex items-center gap-1">
            <button onClick={reload} className="p-1 text-slate-600 hover:text-slate-400 transition-colors cursor-pointer" title="Refresh">
              <RefreshCw size={11} />
            </button>
            <button onClick={handleClear} className="p-1 text-slate-600 hover:text-red-400 transition-colors cursor-pointer" title="Clear all">
              <Trash2 size={11} />
            </button>
          </div>
        </div>

        {/* Today summary */}
        <div className="grid grid-cols-3 gap-1.5 mb-2">
          <div className="bg-slate-800/40 rounded-lg px-2 py-1.5 text-center">
            <p className="text-[15px] font-bold text-slate-200">{todayRuns.length}</p>
            <p className="text-[9px] text-slate-600">runs today</p>
          </div>
          <div className="bg-slate-800/40 rounded-lg px-2 py-1.5 text-center">
            <p className={`text-[15px] font-bold ${successRate >= 80 ? 'text-emerald-400' : successRate >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
              {successRate}%
            </p>
            <p className="text-[9px] text-slate-600">success</p>
          </div>
          <div className="bg-slate-800/40 rounded-lg px-2 py-1.5 text-center">
            <p className="text-[15px] font-bold text-slate-200">
              {todayRuns.length > 0
                ? formatDuration(Math.round(todayRuns.reduce((s, r) => s + r.duration_ms, 0) / todayRuns.length))
                : '—'}
            </p>
            <p className="text-[9px] text-slate-600">avg time</p>
          </div>
        </div>

        {/* Filter */}
        <div className="flex gap-1">
          {(['all', 'success', 'error'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`flex-1 py-0.5 text-[10px] rounded transition-colors cursor-pointer capitalize ${
                filter === f
                  ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                  : 'text-slate-600 hover:text-slate-400 border border-transparent'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Run list */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-center">
            <Clock size={20} className="text-slate-700" />
            <p className="text-xs text-slate-600">No runs yet</p>
          </div>
        )}
        {filtered.map(run => (
          <div key={run.id} className="px-3 py-2.5 border-b border-slate-800/30 hover:bg-slate-800/20 transition-colors">
            <div className="flex items-start gap-2">
              {statusIcon(run.status)}
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-slate-300 truncate">{run.prompt_preview}</p>
                {run.status === 'success' && run.output_preview && (
                  <p className="text-[10px] text-slate-600 truncate mt-0.5">{run.output_preview}</p>
                )}
                {run.status === 'error' && run.error && (
                  <p className="text-[10px] text-red-400 truncate mt-0.5">{run.error}</p>
                )}
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex items-center gap-0.5 text-[9px] text-slate-600">
                    <Zap size={8} className="text-indigo-600" />
                    <span className="font-mono truncate max-w-[80px]">{run.model.split('/').pop()}</span>
                  </div>
                  <span className="text-[9px] text-slate-700">{formatDuration(run.duration_ms)}</span>
                  {run.tokens > 0 && <span className="text-[9px] text-slate-700">~{run.tokens}tok</span>}
                  <span className="text-[9px] text-slate-700 ml-auto">{formatTime(run.timestamp)}</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
