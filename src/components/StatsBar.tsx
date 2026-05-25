import { useEffect, useState } from 'react'
import { getTodayStats, type DayStats } from '../lib/runHistory'
import { Activity, CheckCircle, XCircle, Zap, AlertTriangle } from 'lucide-react'

interface Props {
  selectedModel: string
  refreshKey: number
}

const FREE_TIER_LIMIT = 200

export function StatsBar({ selectedModel, refreshKey }: Props) {
  const [stats, setStats] = useState<DayStats>({ total: 0, successes: 0, errors: 0, tokens: 0 })

  useEffect(() => {
    setStats(getTodayStats())
  }, [refreshKey])

  const usagePct = Math.min((stats.total / FREE_TIER_LIMIT) * 100, 100)
  const nearLimit = usagePct >= 70
  const atLimit = usagePct >= 95

  return (
    <div className="flex items-center gap-3 px-4 py-1 bg-[#08080f] border-b border-slate-800/30 text-[10px] overflow-x-auto scrollbar-none">
      {/* Model in use */}
      <div className="flex items-center gap-1 text-slate-600 flex-shrink-0">
        <Zap size={9} className="text-indigo-500" />
        <span className="font-mono truncate max-w-[130px]">{selectedModel}</span>
      </div>

      <div className="w-px h-3 bg-slate-800 flex-shrink-0" />

      {/* Runs today */}
      <div className="flex items-center gap-1 text-slate-500 flex-shrink-0">
        <Activity size={9} />
        <span>{stats.total} runs today</span>
      </div>

      {/* Success / Error */}
      {stats.total > 0 && (
        <>
          <div className="flex items-center gap-1 text-emerald-600 flex-shrink-0">
            <CheckCircle size={9} />
            <span>{stats.successes}</span>
          </div>
          {stats.errors > 0 && (
            <div className="flex items-center gap-1 text-red-500 flex-shrink-0">
              <XCircle size={9} />
              <span>{stats.errors}</span>
            </div>
          )}
        </>
      )}

      <div className="w-px h-3 bg-slate-800 flex-shrink-0" />

      {/* Usage bar */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {nearLimit && (
          <AlertTriangle size={9} className={atLimit ? 'text-red-400' : 'text-yellow-500'} />
        )}
        <div className="w-16 h-1 bg-slate-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              atLimit ? 'bg-red-500' : nearLimit ? 'bg-yellow-500' : 'bg-indigo-500'
            }`}
            style={{ width: `${usagePct}%` }}
          />
        </div>
        <span className={atLimit ? 'text-red-400' : nearLimit ? 'text-yellow-500' : 'text-slate-600'}>
          {stats.total}/{FREE_TIER_LIMIT}
        </span>
      </div>

      {stats.tokens > 0 && (
        <>
          <div className="w-px h-3 bg-slate-800 flex-shrink-0" />
          <span className="text-slate-700 flex-shrink-0">~{stats.tokens.toLocaleString()} tokens</span>
        </>
      )}
    </div>
  )
}
