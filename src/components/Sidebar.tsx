import { useEffect, useState, useCallback } from 'react'
import { getCapabilities, getPlatforms, getJobs, getModels, updateJob, deleteJob, createJob, getSkills, type Job, type Skill } from '../api'
import { Cpu, Radio, Wrench, RefreshCw, Plus, AlertCircle, Pencil, Trash2, Check, X, ChevronDown, ChevronRight, BookOpen, Search } from 'lucide-react'

type Tab = 'platforms' | 'capabilities' | 'jobs' | 'skills'

interface Props {
  sessionId: string
  onSessionChange: (id: string) => void
  online: boolean
}

export function Sidebar({ sessionId, onSessionChange, online }: Props) {
  const [tab, setTab] = useState<Tab>('platforms')
  const [platforms, setPlatforms] = useState<Array<{ name: string; state: string; error: string | null; updated_at: string }>>([])
  const [capabilities, setCapabilities] = useState<Record<string, { method: string; path: string }>>({})
  const [jobs, setJobs] = useState<Job[]>([])
  const [model, setModel] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingJobId, setEditingJobId] = useState<string | null>(null)
  const [editFields, setEditFields] = useState<{ name: string; schedule: string; enabled: boolean }>({ name: '', schedule: '', enabled: true })
  const [deletingJobId, setDeletingJobId] = useState<string | null>(null)
  const [jobActionLoading, setJobActionLoading] = useState(false)
  const [creatingJob, setCreatingJob] = useState(false)
  const [newJobFields, setNewJobFields] = useState({ name: '', schedule: '', prompt: '' })
  const [skills, setSkills] = useState<Skill[]>([])
  const [skillSearch, setSkillSearch] = useState('')
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())

  const loadData = useCallback(async () => {
    if (!online) return
    setLoading(true)
    setError(null)
    try {
      if (tab === 'platforms') {
        const [p, models] = await Promise.all([getPlatforms(), getModels()])
        setPlatforms(p)
        setModel(models[0]?.id ?? 'hermes-agent')
      } else if (tab === 'capabilities') {
        const cap = await getCapabilities()
        setCapabilities((cap.endpoints as Record<string, { method: string; path: string }>) ?? {})
      } else if (tab === 'jobs') {
        setJobs(await getJobs())
      } else if (tab === 'skills') {
        const s = await getSkills()
        setSkills(s)
        // auto-expand first category
        if (s.length > 0) setExpandedCategories(new Set([s[0].category]))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed')
    } finally {
      setLoading(false)
    }
  }, [tab, online])

  useEffect(() => { loadData() }, [loadData])

  const newSession = () => onSessionChange(crypto.randomUUID())

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'platforms', label: 'Status', icon: <Radio size={12} /> },
    { id: 'capabilities', label: 'API', icon: <Cpu size={12} /> },
    { id: 'jobs', label: 'Jobs', icon: <Wrench size={12} /> },
    { id: 'skills', label: 'Skills', icon: <BookOpen size={12} /> },
  ]

  return (
    <div className="flex flex-col h-full bg-[#0b0b12] border-r border-slate-800/60">
      {/* Session */}
      <div className="px-3 pt-3 pb-2 border-b border-slate-800/40">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-slate-500 font-medium uppercase tracking-wider">Session</span>
          <button
            onClick={newSession}
            className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer"
            title="New session"
          >
            <Plus size={12} /> New
          </button>
        </div>
        <div className="bg-slate-800/50 border border-slate-700/40 rounded-lg px-3 py-2">
          <p className="text-xs font-mono text-slate-300 truncate">{sessionId}</p>
          <p className="text-[10px] text-slate-600 mt-0.5">Active session · {model}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800/60">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-all cursor-pointer relative ${
              tab === t.id
                ? 'text-indigo-400'
                : 'text-slate-600 hover:text-slate-400'
            }`}
          >
            {t.icon}
            <span>{t.label}</span>
            {tab === t.id && (
              <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-0.5 bg-indigo-500 rounded-full" />
            )}
          </button>
        ))}
        <button
          onClick={loadData}
          disabled={loading || !online}
          className="px-2 py-2 text-slate-600 hover:text-slate-400 disabled:opacity-30 transition-colors cursor-pointer border-l border-slate-800/60"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-3 mt-3 flex items-start gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-2.5">
          <AlertCircle size={12} className="flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
        {!online && <p className="text-xs text-slate-600 text-center mt-8">Agent offline</p>}

        {loading && (
          <div className="flex justify-center py-6">
            <RefreshCw size={16} className="animate-spin text-slate-600" />
          </div>
        )}

        {/* PLATFORMS */}
        {tab === 'platforms' && !loading && online && (
          <>
            {platforms.length === 0 && (
              <p className="text-xs text-slate-600 text-center py-4">No platforms found</p>
            )}
            {platforms.map(p => (
              <div key={p.name} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-slate-800/30 border border-slate-700/30">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  p.state === 'connected' ? 'bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.5)]'
                  : p.state === 'connecting' ? 'bg-yellow-400 animate-pulse'
                  : 'bg-red-400'
                }`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-200 capitalize">{p.name.replace('_', ' ')}</p>
                  <p className="text-[10px] text-slate-600 mt-0.5 capitalize">{p.state}</p>
                  {p.error && (
                    <p className="text-[10px] text-red-400 mt-0.5 truncate">{p.error}</p>
                  )}
                </div>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${
                  p.state === 'connected'
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    : 'bg-slate-700/50 text-slate-500 border-slate-600/30'
                }`}>
                  {p.state}
                </span>
              </div>
            ))}
          </>
        )}

        {/* CAPABILITIES / API ENDPOINTS */}
        {tab === 'capabilities' && !loading && online && (
          <>
            {Object.keys(capabilities).length === 0 && (
              <p className="text-xs text-slate-600 text-center py-4">No capabilities data</p>
            )}
            {Object.entries(capabilities).map(([name, ep]) => (
              <div key={name} className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-slate-800/30 border border-slate-700/30">
                <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${
                  ep.method === 'GET' ? 'bg-emerald-500/15 text-emerald-400'
                  : ep.method === 'POST' ? 'bg-blue-500/15 text-blue-400'
                  : ep.method === 'DELETE' ? 'bg-red-500/15 text-red-400'
                  : 'bg-slate-700 text-slate-400'
                }`}>
                  {ep.method}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-mono text-slate-300 truncate">{ep.path}</p>
                  <p className="text-[10px] text-slate-600">{name.replace(/_/g, ' ')}</p>
                </div>
              </div>
            ))}
          </>
        )}

        {/* JOBS */}
        {tab === 'jobs' && !loading && online && (
          <>
            {/* Create Job Form */}
            <div className="rounded-lg bg-slate-800/30 border border-slate-700/30 overflow-hidden mb-1">
              <button
                onClick={() => setCreatingJob(v => !v)}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
              >
                {creatingJob ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                <Plus size={11} className="text-indigo-400" />
                <span>New Job</span>
              </button>
              {creatingJob && (
                <div className="border-t border-slate-700/40 px-3 py-2.5 space-y-2 bg-slate-900/40">
                  <div>
                    <label className="text-[10px] text-slate-500 uppercase tracking-wider">Name</label>
                    <input
                      className="w-full mt-0.5 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                      value={newJobFields.name}
                      onChange={e => setNewJobFields(f => ({ ...f, name: e.target.value }))}
                      placeholder="e.g. Daily summary"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 uppercase tracking-wider">Schedule (cron)</label>
                    <input
                      className="w-full mt-0.5 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs font-mono text-slate-200 focus:outline-none focus:border-indigo-500"
                      value={newJobFields.schedule}
                      onChange={e => setNewJobFields(f => ({ ...f, schedule: e.target.value }))}
                      placeholder="0 9 * * * (9am daily)"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 uppercase tracking-wider">Task / Prompt</label>
                    <textarea
                      className="w-full mt-0.5 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 resize-none"
                      rows={3}
                      value={newJobFields.prompt}
                      onChange={e => setNewJobFields(f => ({ ...f, prompt: e.target.value }))}
                      placeholder="What should the agent do?"
                    />
                  </div>
                  <div className="flex gap-1.5 pt-1">
                    <button
                      disabled={jobActionLoading || !newJobFields.name || !newJobFields.schedule}
                      onClick={async () => {
                        setJobActionLoading(true)
                        try {
                          await createJob({
                            name: newJobFields.name,
                            schedule: newJobFields.schedule,
                            prompt: newJobFields.prompt,
                          })
                          setNewJobFields({ name: '', schedule: '', prompt: '' })
                          setCreatingJob(false)
                          await loadData()
                        } catch (e) {
                          setError(e instanceof Error ? e.message : 'Create failed')
                        } finally {
                          setJobActionLoading(false)
                        }
                      }}
                      className="flex items-center gap-1 px-2 py-1 rounded text-[11px] bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white cursor-pointer transition-colors"
                    >
                      <Check size={10} /> Create
                    </button>
                    <button
                      onClick={() => setCreatingJob(false)}
                      className="flex items-center gap-1 px-2 py-1 rounded text-[11px] bg-slate-700 hover:bg-slate-600 text-slate-300 cursor-pointer transition-colors"
                    >
                      <X size={10} /> Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

            {jobs.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
                <Wrench size={20} className="text-slate-700" />
                <p className="text-xs text-slate-600">No scheduled jobs</p>
                <p className="text-[10px] text-slate-700">Use the form above to create one</p>
              </div>
            )}
            {jobs.map(job => {
              const scheduleStr = job.schedule_display as string ?? (job.schedule as { display?: string })?.display ?? ''
              const rawSchedule = typeof job.schedule === 'string' ? job.schedule : (job.schedule as { cron?: string })?.cron ?? scheduleStr
              const state = job.state as string ?? ''
              const lastStatus = job.last_status as string ?? ''
              const nextRun = job.next_run_at as string ?? ''
              const isEditing = editingJobId === job.id
              const isDeleting = deletingJobId === job.id

              return (
                <div key={job.id} className="rounded-lg bg-slate-800/30 border border-slate-700/30 overflow-hidden">
                  {/* Job header row */}
                  <div className="flex items-start gap-2.5 px-3 py-2.5">
                    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5 ${
                      state === 'scheduled' ? 'bg-emerald-400' :
                      state === 'running' ? 'bg-blue-400 animate-pulse' :
                      state === 'paused' ? 'bg-yellow-400' : 'bg-slate-600'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-slate-200 truncate">{job.name ?? job.id}</p>
                      {scheduleStr && (
                        <p className="text-[10px] text-slate-500 font-mono mt-0.5">{scheduleStr}</p>
                      )}
                      <div className="flex items-center gap-2 mt-0.5">
                        {state && (
                          <span className={`text-[10px] ${state === 'scheduled' ? 'text-emerald-500' : state === 'running' ? 'text-blue-400' : 'text-slate-600'}`}>
                            {state}
                          </span>
                        )}
                        {lastStatus && (
                          <span className={`text-[10px] ${lastStatus === 'ok' ? 'text-emerald-600' : 'text-red-400'}`}>
                            · last: {lastStatus}
                          </span>
                        )}
                      </div>
                      {nextRun && (
                        <p className="text-[10px] text-slate-700 mt-0.5">
                          next: {new Date(nextRun).toLocaleString()}
                        </p>
                      )}
                    </div>
                    {/* Edit / Delete buttons */}
                    <div className="flex gap-1 flex-shrink-0">
                      <button
                        onClick={() => {
                          if (isEditing) {
                            setEditingJobId(null)
                          } else {
                            setEditingJobId(job.id)
                            setDeletingJobId(null)
                            setEditFields({
                              name: (job.name as string) ?? '',
                              schedule: rawSchedule,
                              enabled: (job.enabled as boolean) ?? true,
                            })
                          }
                        }}
                        className={`p-1 rounded transition-colors cursor-pointer ${isEditing ? 'text-indigo-400 bg-indigo-500/10' : 'text-slate-600 hover:text-slate-300'}`}
                        title="Edit job"
                      >
                        <Pencil size={11} />
                      </button>
                      <button
                        onClick={() => {
                          setDeletingJobId(isDeleting ? null : job.id)
                          setEditingJobId(null)
                        }}
                        className={`p-1 rounded transition-colors cursor-pointer ${isDeleting ? 'text-red-400 bg-red-500/10' : 'text-slate-600 hover:text-red-400'}`}
                        title="Delete job"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>

                  {/* Edit form (inline expand) */}
                  {isEditing && (
                    <div className="border-t border-slate-700/40 px-3 py-2.5 space-y-2 bg-slate-900/40">
                      <div>
                        <label className="text-[10px] text-slate-500 uppercase tracking-wider">Name</label>
                        <input
                          className="w-full mt-0.5 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                          value={editFields.name}
                          onChange={e => setEditFields(f => ({ ...f, name: e.target.value }))}
                          placeholder="Job name"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 uppercase tracking-wider">Schedule (cron)</label>
                        <input
                          className="w-full mt-0.5 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs font-mono text-slate-200 focus:outline-none focus:border-indigo-500"
                          value={editFields.schedule}
                          onChange={e => setEditFields(f => ({ ...f, schedule: e.target.value }))}
                          placeholder="e.g. 0 9 * * *"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-[10px] text-slate-500 uppercase tracking-wider">Enabled</label>
                        <button
                          onClick={() => setEditFields(f => ({ ...f, enabled: !f.enabled }))}
                          className={`w-8 h-4 rounded-full transition-colors cursor-pointer relative ${editFields.enabled ? 'bg-indigo-500' : 'bg-slate-700'}`}
                        >
                          <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${editFields.enabled ? 'left-[18px]' : 'left-0.5'}`} />
                        </button>
                      </div>
                      <div className="flex gap-1.5 pt-1">
                        <button
                          disabled={jobActionLoading}
                          onClick={async () => {
                            setJobActionLoading(true)
                            try {
                              const patch: Partial<Job> = {}
                              if (editFields.name) patch.name = editFields.name
                              if (editFields.schedule) patch.schedule = editFields.schedule
                              patch.enabled = editFields.enabled
                              await updateJob(job.id, patch)
                              setEditingJobId(null)
                              await loadData()
                            } catch (e) {
                              setError(e instanceof Error ? e.message : 'Update failed')
                            } finally {
                              setJobActionLoading(false)
                            }
                          }}
                          className="flex items-center gap-1 px-2 py-1 rounded text-[11px] bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white cursor-pointer transition-colors"
                        >
                          <Check size={10} /> Save
                        </button>
                        <button
                          onClick={() => setEditingJobId(null)}
                          className="flex items-center gap-1 px-2 py-1 rounded text-[11px] bg-slate-700 hover:bg-slate-600 text-slate-300 cursor-pointer transition-colors"
                        >
                          <X size={10} /> Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Delete confirm */}
                  {isDeleting && (
                    <div className="border-t border-slate-700/40 px-3 py-2 bg-red-500/5 flex items-center justify-between">
                      <p className="text-[11px] text-red-400">Delete this job?</p>
                      <div className="flex gap-1.5">
                        <button
                          disabled={jobActionLoading}
                          onClick={async () => {
                            setJobActionLoading(true)
                            try {
                              await deleteJob(job.id)
                              setDeletingJobId(null)
                              await loadData()
                            } catch (e) {
                              setError(e instanceof Error ? e.message : 'Delete failed')
                            } finally {
                              setJobActionLoading(false)
                            }
                          }}
                          className="flex items-center gap-1 px-2 py-1 rounded text-[11px] bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white cursor-pointer transition-colors"
                        >
                          <Trash2 size={10} /> Yes
                        </button>
                        <button
                          onClick={() => setDeletingJobId(null)}
                          className="px-2 py-1 rounded text-[11px] bg-slate-700 hover:bg-slate-600 text-slate-300 cursor-pointer transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </>
        )}

        {/* SKILLS */}
        {tab === 'skills' && !loading && (() => {
          const query = skillSearch.toLowerCase()
          const filtered = skills.filter(s =>
            !query ||
            s.name.toLowerCase().includes(query) ||
            s.description.toLowerCase().includes(query) ||
            s.category.toLowerCase().includes(query) ||
            s.tags.some(t => t.toLowerCase().includes(query))
          )
          const categories = [...new Set(filtered.map(s => s.category))]
          const toggleCat = (cat: string) => setExpandedCategories(prev => {
            const next = new Set(prev)
            next.has(cat) ? next.delete(cat) : next.add(cat)
            return next
          })
          return (
            <>
              <div className="relative mb-2">
                <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none" />
                <input
                  value={skillSearch}
                  onChange={e => setSkillSearch(e.target.value)}
                  placeholder="Search skills…"
                  className="w-full bg-slate-800/60 border border-slate-700/40 rounded-lg pl-7 pr-3 py-1.5 text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-indigo-500/50"
                />
              </div>
              {filtered.length === 0 && (
                <p className="text-xs text-slate-600 text-center py-4">No skills found</p>
              )}
              {categories.map(cat => {
                const catSkills = filtered.filter(s => s.category === cat)
                const isOpen = expandedCategories.has(cat)
                return (
                  <div key={cat} className="rounded-lg bg-slate-800/30 border border-slate-700/30 overflow-hidden mb-1">
                    <button
                      onClick={() => toggleCat(cat)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs cursor-pointer hover:bg-slate-700/20 transition-colors"
                    >
                      {isOpen ? <ChevronDown size={11} className="text-slate-500" /> : <ChevronRight size={11} className="text-slate-500" />}
                      <span className="font-medium text-slate-300 capitalize flex-1 text-left">{cat.replace(/-/g, ' ')}</span>
                      <span className="text-[10px] text-slate-600 bg-slate-700/50 px-1.5 py-0.5 rounded-full">{catSkills.length}</span>
                    </button>
                    {isOpen && (
                      <div className="border-t border-slate-700/30">
                        {catSkills.map(skill => (
                          <div key={skill.id} className="px-3 py-2 border-b border-slate-700/20 last:border-0 hover:bg-slate-700/10 transition-colors">
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-[11px] font-medium text-slate-200">{skill.name}</p>
                              {skill.version && (
                                <span className="text-[9px] text-slate-600 font-mono flex-shrink-0 mt-0.5">v{skill.version}</span>
                              )}
                            </div>
                            {skill.description && (
                              <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">{skill.description}</p>
                            )}
                            {skill.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                {skill.tags.slice(0, 4).map(tag => (
                                  <span key={tag} className="text-[9px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-1.5 py-0.5 rounded-full">{tag}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </>
          )
        })()}
      </div>
    </div>
  )
}
