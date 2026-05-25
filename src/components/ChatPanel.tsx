import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, AlertCircle, User, Trash2, Zap, ChevronDown, Check, Square, Wrench, Plus, X, Zap as ZapIcon, RotateCcw, ImageIcon, Download, Loader2 } from 'lucide-react'
import { startRun, stopRun, streamRunEvents, getModels, generateImage, getImageStatus, type ChatMessage, type RunEvent } from '../api'
import { MarkdownRenderer } from './MarkdownRenderer'
import { saveRun } from '../lib/runHistory'

const FALLBACK_MODELS_KEY = 'hermes_fallback_models'
const DEFAULT_FALLBACKS = [
  'google/gemini-2.0-flash-exp:free',
  'meta-llama/llama-3.1-8b-instruct:free',
  'mistralai/mistral-7b-instruct:free',
]

function loadFallbacks(): string[] {
  try { return JSON.parse(localStorage.getItem(FALLBACK_MODELS_KEY) ?? 'null') ?? DEFAULT_FALLBACKS }
  catch { return DEFAULT_FALLBACKS }
}

interface DisplayMessage {
  id: string
  role: 'user' | 'assistant' | 'error' | 'image'
  content: string
  timestamp: Date
  tokens?: number
  imageUrl?: string
  imagePrompt?: string
  imageProgress?: number
}

interface Activity {
  type: 'tool' | 'thinking' | 'approval'
  label: string
}

interface Props {
  sessionId: string
  online: boolean
  selectedModel: string
  onModelChange: (model: string) => void
  initialDisplay?: DisplayMessage[]
  initialHistory?: ChatMessage[]
  onMessagesUpdate?: (display: DisplayMessage[], history: ChatMessage[]) => void
  onRunSaved?: () => void
}

export function ChatPanel({ sessionId, online, selectedModel, onModelChange, initialDisplay, initialHistory, onMessagesUpdate, onRunSaved }: Props) {
  const [display, setDisplay] = useState<DisplayMessage[]>(initialDisplay ?? [])
  const [history, setHistory] = useState<ChatMessage[]>(initialHistory ?? [])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [activity, setActivity] = useState<Activity | null>(null)
  const [streamingMsgId, setStreamingMsgId] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const runIdRef = useRef<string | null>(null)
  const [models, setModels] = useState<string[]>(['hermes-agent'])
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null)
  const [imageMode, setImageMode] = useState(false)
  const [imageAspect, setImageAspect] = useState('1:1')
  const [imageRes, setImageRes] = useState('1K')
  const [imageLoading, setImageLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const fetchModels = useCallback(async () => {
    if (!online) return
    try {
      const list = await getModels()
      const ids = list.map(m => m.id).filter(Boolean)
      if (ids.length > 0) setModels(ids)
    } catch { /* keep defaults */ }
  }, [online])

  useEffect(() => { fetchModels() }, [fetchModels])

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Reset chat when session changes
  useEffect(() => {
    setDisplay(initialDisplay ?? [])
    setHistory(initialHistory ?? [])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [display])

  useEffect(() => {
    if (display.length > 0) onMessagesUpdate?.(display, history)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [display, history])

  const executeRun = async (
    msgHistory: ChatMessage[],
    model: string,
    assistantMsgId: string,
    abort: AbortController,
    promptText: string,
  ): Promise<{ output: string; tokens: number; status: 'success' | 'error' | 'stopped'; error?: string }> => {
    const startMs = Date.now()
    let accumulated = ''
    let settled = false

    try {
      const { run_id } = await startRun(msgHistory, model, abort.signal)
      runIdRef.current = run_id

      await new Promise<void>((resolve, reject) => {
        const closeStream = streamRunEvents(run_id, (event: RunEvent) => {
          if (event.event === 'message.delta' && event.delta) {
            accumulated += event.delta
            setDisplay(prev => prev.map(m =>
              m.id === assistantMsgId ? { ...m, content: accumulated } : m
            ))
          } else if (event.event === 'tool.started') {
            setActivity({ type: 'tool', label: (event.tool ?? event.name ?? 'tool') as string })
          } else if (event.event === 'tool.completed') {
            setActivity(null)
          } else if (event.event === 'reasoning.available') {
            setActivity({ type: 'thinking', label: 'Thinking…' })
          } else if (event.event === 'approval.request') {
            setActivity({ type: 'approval', label: 'Waiting for approval…' })
          } else if (event.event === 'run.completed') {
            settled = true; setActivity(null); closeStream(); resolve()
          } else if (event.event === 'run.failed') {
            settled = true; closeStream()
            reject(new Error((event.error as string) ?? 'Run failed'))
          } else if (event.event === 'run.cancelled') {
            settled = true; closeStream()
            const e = new Error('Stopped by user'); e.name = 'AbortError'; reject(e)
          }
        }, abort.signal, (err) => { if (!settled) { settled = true; reject(err) } })

        abort.signal.addEventListener('abort', () => {
          if (!settled) {
            closeStream(); stopRun(run_id).catch(() => {})
            const e = new Error('Stopped by user'); e.name = 'AbortError'; reject(e)
          }
        })
      })

      const tokens = Math.round((promptText.length + accumulated.length) / 4)
      const duration = Date.now() - startMs
      saveRun({ id: crypto.randomUUID(), run_id, model, prompt_preview: promptText.slice(0, 80), output_preview: accumulated.slice(0, 80), status: 'success', tokens, duration_ms: duration, timestamp: new Date().toISOString() })
      onRunSaved?.()
      return { output: accumulated, tokens, status: 'success' }
    } catch (err) {
      const duration = Date.now() - startMs
      const isStopped = err instanceof Error && err.name === 'AbortError'
      const errMsg = err instanceof Error ? err.message : 'Request failed'
      if (!isStopped) {
        saveRun({ id: crypto.randomUUID(), run_id: runIdRef.current ?? '', model, prompt_preview: promptText.slice(0, 80), output_preview: accumulated.slice(0, 80), status: 'error', tokens: 0, duration_ms: duration, timestamp: new Date().toISOString(), error: errMsg })
        onRunSaved?.()
      }
      return { output: accumulated, tokens: 0, status: isStopped ? 'stopped' : 'error', error: errMsg }
    }
  }

  const handleSend = async () => {
    const text = input.trim()
    if (!text || loading || !online) return

    const userMsg: DisplayMessage = { id: crypto.randomUUID(), role: 'user', content: text, timestamp: new Date() }
    const newHistory: ChatMessage[] = [...history, { role: 'user', content: text }]
    setDisplay(prev => [...prev, userMsg])
    setHistory(newHistory)
    setInput('')
    setLoading(true)
    setActivity(null)
    setFallbackNotice(null)

    const abort = new AbortController()
    abortRef.current = abort
    const assistantMsgId = crypto.randomUUID()

    setStreamingMsgId(assistantMsgId)
    setDisplay(prev => [...prev, { id: assistantMsgId, role: 'assistant', content: '', timestamp: new Date() }])

    // Build model chain: primary + fallbacks
    const fallbacks = loadFallbacks()
    const modelChain = [selectedModel || 'hermes-agent', ...fallbacks.filter(f => f !== selectedModel)]

    let lastError = ''
    let succeeded = false

    for (let i = 0; i < modelChain.length; i++) {
      const model = modelChain[i]
      if (abort.signal.aborted) break

      if (i > 0) {
        setFallbackNotice(`Rate limited — retrying with ${model.split('/').pop()}…`)
        // Reset placeholder content for retry
        setDisplay(prev => prev.map(m => m.id === assistantMsgId ? { ...m, content: '' } : m))
      }

      const result = await executeRun(newHistory, model, assistantMsgId, abort, text)

      if (result.status === 'stopped') {
        setDisplay(prev => {
          const filtered = result.output ? prev : prev.filter(m => m.id !== assistantMsgId)
          return [...filtered, { id: crypto.randomUUID(), role: 'error', content: 'Stopped by user', timestamp: new Date() }]
        })
        succeeded = true
        break
      }

      if (result.status === 'success') {
        setHistory(prev => [...prev, { role: 'assistant', content: result.output }])
        if (i > 0) {
          onModelChange(model) // switch to the working fallback
          setFallbackNotice(`Switched to ${model.split('/').pop()}`)
          setTimeout(() => setFallbackNotice(null), 4000)
        } else {
          setFallbackNotice(null)
        }
        succeeded = true
        break
      }

      // Error — check if 429 to try next fallback
      lastError = result.error ?? 'Request failed'
      const is429 = lastError.includes('429') || lastError.toLowerCase().includes('rate limit')
      if (!is429 || i === modelChain.length - 1) break
    }

    if (!succeeded) {
      setDisplay(prev => {
        const placeholder = prev.find(m => m.id === assistantMsgId)
        const filtered = placeholder?.content ? prev : prev.filter(m => m.id !== assistantMsgId)
        return [...filtered, { id: crypto.randomUUID(), role: 'error', content: lastError || 'Request failed', timestamp: new Date() }]
      })
    }

    runIdRef.current = null
    abortRef.current = null
    setLoading(false)
    setActivity(null)
    setStreamingMsgId(null)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  const clearChat = () => {
    setDisplay([])
    setHistory([])
  }

  const handleGenerateImage = async () => {
    const prompt = input.trim()
    if (!prompt || imageLoading) return
    setImageLoading(true)
    setInput('')

    const userMsg: DisplayMessage = { id: crypto.randomUUID(), role: 'user', content: `🎨 ${prompt}`, timestamp: new Date() }
    const placeholderId = crypto.randomUUID()
    const placeholder: DisplayMessage = {
      id: placeholderId, role: 'image', content: '', timestamp: new Date(),
      imagePrompt: prompt, imageProgress: 0,
    }
    setDisplay(prev => [...prev, userMsg, placeholder])

    try {
      const res = await generateImage(prompt, imageAspect, imageRes)
      if (!res.ok || !res.taskId) throw new Error(res.error ?? 'Failed to start generation')

      // Poll for result
      let attempts = 0
      const maxAttempts = 60 // 3 min max
      while (attempts < maxAttempts) {
        await new Promise(r => setTimeout(r, 3000))
        attempts++
        const status = await getImageStatus(res.taskId!)
        const d = status.data
        if (!d) throw new Error('No status data')

        const progress = typeof d.progress === 'number' ? d.progress : 0
        setDisplay(prev => prev.map(m => m.id === placeholderId ? { ...m, imageProgress: progress } : m))

        if (d.state === 'success') {
          let imageUrl = ''
          try {
            const parsed = JSON.parse(d.resultJson ?? '{}')
            imageUrl = parsed.resultUrls?.[0] ?? ''
          } catch { /* ignore */ }
          setDisplay(prev => prev.map(m =>
            m.id === placeholderId ? { ...m, imageUrl, imageProgress: 100 } : m
          ))
          break
        }
        if (d.state === 'fail') throw new Error(d.failMsg ?? 'Generation failed')
      }
      if (attempts >= maxAttempts) throw new Error('Generation timed out')
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : 'Image generation failed'
      setDisplay(prev => prev.map(m =>
        m.id === placeholderId
          ? { ...m, content: errMsg, role: 'error', imageUrl: undefined }
          : m
      ))
    } finally {
      setImageLoading(false)
    }
  }

  const DEFAULT_ACTIONS = [
    'List available tools',
    'Show memory contents',
    'What skills do you have?',
    'Summarize recent work',
    "What's on my calendar today?",
  ]

  const QUICK_ACTIONS_KEY = 'hermes_quick_actions'
  const [quickActions, setQuickActions] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(QUICK_ACTIONS_KEY)
      return saved ? JSON.parse(saved) : DEFAULT_ACTIONS
    } catch { return DEFAULT_ACTIONS }
  })
  const [addingAction, setAddingAction] = useState(false)
  const [newAction, setNewAction] = useState('')
  const [actionsExpanded, setActionsExpanded] = useState(true)

  const saveQuickActions = (actions: string[]) => {
    setQuickActions(actions)
    localStorage.setItem(QUICK_ACTIONS_KEY, JSON.stringify(actions))
  }

  const addCustomAction = () => {
    const trimmed = newAction.trim()
    if (!trimmed || quickActions.includes(trimmed)) return
    saveQuickActions([...quickActions, trimmed])
    setNewAction('')
    setAddingAction(false)
  }

  const removeAction = (action: string) => {
    saveQuickActions(quickActions.filter(a => a !== action))
  }

  const SUGGESTIONS = DEFAULT_ACTIONS

  return (
    <div className="flex flex-col h-full bg-[#0d0d14]">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800/60">
        <div className="flex items-center gap-2">
          <img src="/bot-avatar.jpg" className="w-5 h-5 rounded-full object-cover" alt="bot" />
          <span className="text-sm font-medium text-slate-200">Chat</span>
          <span className="text-xs text-slate-600 font-mono ml-1">#{sessionId.slice(0, 8)}</span>
          {history.length > 0 && (
            <span className="text-xs text-slate-700 bg-slate-800 px-1.5 py-0.5 rounded-full">
              {Math.floor(history.length / 2)} turns
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Model dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen(v => !v)}
              disabled={!online}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 text-xs text-slate-300 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Zap size={11} className="text-indigo-400" />
              <span className="max-w-[140px] truncate">{selectedModel}</span>
              <ChevronDown size={11} className={`text-slate-500 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {dropdownOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-52 bg-[#12121a] border border-slate-700/60 rounded-xl shadow-2xl overflow-hidden z-50">
                <div className="px-3 py-2 border-b border-slate-700/40">
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Select Model</p>
                </div>
                <div className="py-1 max-h-48 overflow-y-auto">
                  {models.map(m => (
                    <button
                      key={m}
                      onClick={() => { onModelChange(m); setDropdownOpen(false) }}
                      className="w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-slate-700/40 transition-colors cursor-pointer text-left"
                    >
                      <span className={`font-mono ${m === selectedModel ? 'text-indigo-300' : 'text-slate-300'}`}>
                        {m}
                      </span>
                      {m === selectedModel && <Check size={11} className="text-indigo-400 flex-shrink-0" />}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {display.length > 0 && (
            <button
              onClick={clearChat}
              className="text-slate-600 hover:text-slate-400 transition-colors cursor-pointer"
              title="Clear chat"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {display.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-4 pb-16">
            <div className="w-14 h-14 rounded-2xl overflow-hidden border border-indigo-500/20">
              <img src="/bot-avatar.jpg" className="w-full h-full object-cover" alt="bot" />
            </div>
            <div>
              <p className="text-slate-300 font-medium">Hermes Agent</p>
              <p className="text-slate-600 text-sm mt-1">Connected via /v1/runs</p>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2 w-full max-w-sm">
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => { setInput(s); inputRef.current?.focus() }}
                  className="text-left px-3 py-2 text-xs text-slate-400 bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 rounded-lg transition-colors cursor-pointer"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {display.map(msg => {
          if (msg.role === 'image') {
            return (
              <div key={msg.id} className="flex gap-3 items-start">
                <div className="flex-shrink-0 w-7 h-7 rounded-full overflow-hidden border border-purple-500/30">
                  <img src="/bot-avatar.jpg" className="w-full h-full object-cover" alt="bot" />
                </div>
                <div className="flex flex-col">
                  <div className="rounded-2xl rounded-tl-sm bg-slate-800/60 border border-slate-700/40 overflow-hidden inline-block">
                    {msg.imageUrl ? (
                      <>
                        <img src={msg.imageUrl} alt={msg.imagePrompt} className="block max-w-xs max-h-80 object-contain" />
                        <div className="px-3 py-2 flex items-center justify-between gap-4">
                          <p className="text-[11px] text-slate-500 truncate max-w-[200px]">{msg.imagePrompt}</p>
                          <a href={msg.imageUrl} download target="_blank" rel="noreferrer"
                            className="flex items-center gap-1 text-[10px] text-indigo-400 hover:text-indigo-300 flex-shrink-0 cursor-pointer">
                            <Download size={10} /> Save
                          </a>
                        </div>
                      </>
                    ) : (
                      <div className="px-4 py-4 flex flex-col gap-2 w-56">
                        <div className="flex items-center gap-2">
                          <Loader2 size={14} className="text-purple-400 animate-spin flex-shrink-0" />
                          <span className="text-xs text-slate-400">Generating image…</span>
                          {(msg.imageProgress ?? 0) > 0 && (
                            <span className="text-[10px] text-slate-600">{msg.imageProgress}%</span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-600 truncate">{msg.imagePrompt}</p>
                        <div className="w-full h-1 bg-slate-700 rounded-full overflow-hidden">
                          <div className="h-full bg-purple-500 rounded-full transition-all animate-pulse" style={{ width: `${Math.max(msg.imageProgress ?? 0, 5)}%` }} />
                        </div>
                      </div>
                    )}
                  </div>
                  <span className="text-xs text-slate-700 mt-1 px-1">{msg.timestamp.toLocaleTimeString()}</span>
                </div>
              </div>
            )
          }

          return (
          <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${
              msg.role === 'user'
                ? 'bg-indigo-500/20 border border-indigo-500/30'
                : msg.role === 'error'
                ? 'bg-red-500/20 border border-red-500/30'
                : 'overflow-hidden border border-slate-600/30'
            }`}>
              {msg.role === 'user'
                ? <User size={13} className="text-indigo-300" />
                : msg.role === 'error'
                ? <AlertCircle size={13} className="text-red-400" />
                : <img src="/bot-avatar.jpg" className="w-full h-full object-cover" alt="bot" />
              }
            </div>

            <div className={`flex-1 min-w-0 max-w-[85%] ${msg.role === 'user' ? 'items-end flex flex-col' : ''}`}>
              <div className={`rounded-2xl px-4 py-3 text-sm ${
                msg.role === 'user'
                  ? 'bg-indigo-500/15 border border-indigo-500/20 text-slate-200 rounded-tr-sm'
                  : msg.role === 'error'
                  ? 'bg-red-500/10 border border-red-500/20 text-red-300 rounded-tl-sm'
                  : 'bg-slate-800/60 border border-slate-700/40 rounded-tl-sm'
              }`}>
                {msg.role === 'assistant' && msg.id === streamingMsgId && msg.content === ''
                  ? (
                    <div className="flex items-center gap-1.5 py-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce [animation-delay:0ms]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce [animation-delay:150ms]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce [animation-delay:300ms]" />
                    </div>
                  ) : msg.role === 'assistant'
                  ? <MarkdownRenderer content={msg.content} />
                  : <p className="whitespace-pre-wrap">{msg.content}</p>
                }
              </div>
              <span className="text-xs text-slate-700 mt-1 px-1">
                {msg.timestamp.toLocaleTimeString()}
              </span>
            </div>
          </div>
          )
        })}

        <div ref={bottomRef} />
      </div>

      {/* Quick Actions */}
      <div className="px-5 pt-3 border-t border-slate-800/60">
        <div className="flex items-center gap-1 mb-2">
          <button
            onClick={() => setActionsExpanded(v => !v)}
            className="flex items-center gap-1 text-[10px] text-slate-600 hover:text-slate-400 transition-colors cursor-pointer"
          >
            <ZapIcon size={10} className="text-indigo-500" />
            Quick Actions
            <ChevronDown size={10} className={`transition-transform ${actionsExpanded ? 'rotate-180' : ''}`} />
          </button>
          <button
            onClick={() => setAddingAction(v => !v)}
            className="ml-auto text-[10px] text-slate-700 hover:text-indigo-400 transition-colors cursor-pointer flex items-center gap-0.5"
            title="Add custom action"
          >
            <Plus size={10} />
          </button>
        </div>

        {actionsExpanded && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {quickActions.map(action => (
              <div key={action} className="group flex items-center gap-0.5">
                <button
                  onClick={() => { setInput(action); inputRef.current?.focus() }}
                  disabled={!online || loading}
                  className="px-2.5 py-1 text-[11px] text-slate-400 bg-slate-800/50 hover:bg-indigo-500/20 hover:text-indigo-300 border border-slate-700/50 hover:border-indigo-500/30 rounded-full transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {action}
                </button>
                <button
                  onClick={() => removeAction(action)}
                  className="opacity-0 group-hover:opacity-100 text-slate-700 hover:text-red-400 transition-all cursor-pointer"
                  title="Remove"
                >
                  <X size={9} />
                </button>
              </div>
            ))}
          </div>
        )}

        {addingAction && (
          <div className="flex gap-1.5 mb-2">
            <input
              autoFocus
              value={newAction}
              onChange={e => setNewAction(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addCustomAction(); if (e.key === 'Escape') setAddingAction(false) }}
              placeholder="Custom action prompt…"
              className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-[11px] text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500/50"
            />
            <button
              onClick={addCustomAction}
              disabled={!newAction.trim()}
              className="px-2 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-[11px] cursor-pointer transition-colors"
            >
              Add
            </button>
            <button
              onClick={() => setAddingAction(false)}
              className="px-2 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-[11px] cursor-pointer transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="px-5 pb-4">
        {!online && !imageMode && (
          <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mb-3">
            <AlertCircle size={12} />
            Agent is offline — messages cannot be sent
          </div>
        )}
        {fallbackNotice && (
          <div className="flex items-center gap-2 mb-2 px-1 py-1.5 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
            <RotateCcw size={11} className="text-yellow-400 flex-shrink-0 animate-spin" />
            <span className="text-xs text-yellow-300 truncate">{fallbackNotice}</span>
          </div>
        )}
        {loading && activity && !imageMode && (
          <div className="flex items-center gap-2 mb-2 px-1">
            {activity.type === 'tool'
              ? <Wrench size={11} className="text-amber-400 flex-shrink-0" />
              : <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse flex-shrink-0" />
            }
            <span className={`text-xs font-mono truncate ${
              activity.type === 'tool' ? 'text-amber-300' :
              activity.type === 'approval' ? 'text-yellow-300' :
              'text-slate-500'
            }`}>
              {activity.type === 'tool' ? `Calling ${activity.label}…` : activity.label}
            </span>
          </div>
        )}

        {/* Image mode controls */}
        {imageMode && (
          <div className="mb-2 p-2.5 bg-purple-500/10 border border-purple-500/20 rounded-xl">
            <div className="flex items-center gap-2 mb-2">
              <ImageIcon size={11} className="text-purple-400 flex-shrink-0" />
              <span className="text-[11px] text-purple-300 font-medium">Image Generation</span>
              <span className="text-[10px] text-slate-600 ml-auto">KIE • gpt-image-2</span>
            </div>
            <div className="flex flex-wrap gap-1 mb-1.5">
              <span className="text-[10px] text-slate-600 self-center mr-0.5">Ratio:</span>
              {['auto', '1:1', '16:9', '9:16', '4:3', '3:4'].map(r => (
                <button
                  key={r}
                  onClick={() => setImageAspect(r)}
                  className={`px-2 py-0.5 text-[10px] rounded-md border transition-colors cursor-pointer ${
                    imageAspect === r
                      ? 'bg-purple-500/30 text-purple-200 border-purple-500/50'
                      : 'bg-slate-800/50 text-slate-500 border-slate-700/50 hover:text-slate-300'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1">
              <span className="text-[10px] text-slate-600 self-center mr-0.5">Res:</span>
              {['1K', '2K', '4K'].map(r => (
                <button
                  key={r}
                  onClick={() => setImageRes(r)}
                  className={`px-2 py-0.5 text-[10px] rounded-md border transition-colors cursor-pointer ${
                    imageRes === r
                      ? 'bg-purple-500/30 text-purple-200 border-purple-500/50'
                      : 'bg-slate-800/50 text-slate-500 border-slate-700/50 hover:text-slate-300'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                if (imageMode) handleGenerateImage()
                else handleSend()
              }
            }}
            placeholder={imageMode ? 'Describe the image you want to generate…' : online ? 'Message Hermes… (Enter to send, Shift+Enter for newline)' : 'Agent offline'}
            disabled={imageMode ? imageLoading : (!online || loading)}
            rows={1}
            className={`flex-1 resize-none bg-slate-800/60 border rounded-xl px-4 py-3 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:bg-slate-800 transition-all disabled:opacity-40 disabled:cursor-not-allowed min-h-[46px] max-h-40 ${
              imageMode
                ? 'border-purple-500/40 focus:border-purple-500/60'
                : 'border-slate-700/50 focus:border-indigo-500/50'
            }`}
            onInput={e => {
              const t = e.currentTarget
              t.style.height = 'auto'
              t.style.height = Math.min(t.scrollHeight, 160) + 'px'
            }}
          />

          {/* Image mode toggle */}
          <button
            onClick={() => setImageMode(v => !v)}
            disabled={loading || imageLoading}
            title={imageMode ? 'Switch to chat mode' : 'Switch to image generation mode'}
            className={`flex-shrink-0 w-[46px] h-[46px] rounded-xl border flex items-center justify-center transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
              imageMode
                ? 'bg-purple-500/30 border-purple-500/50 text-purple-300 hover:bg-purple-500/40'
                : 'bg-slate-800/60 border-slate-700/50 text-slate-500 hover:text-slate-300 hover:border-slate-600'
            }`}
          >
            <ImageIcon size={16} />
          </button>

          {imageMode ? (
            imageLoading ? (
              <button
                disabled
                className="flex-shrink-0 w-[46px] h-[46px] rounded-xl bg-purple-500/20 border border-purple-500/30 text-purple-400 flex items-center justify-center"
              >
                <Loader2 size={16} className="animate-spin" />
              </button>
            ) : (
              <button
                onClick={handleGenerateImage}
                disabled={!input.trim()}
                className="flex-shrink-0 w-[46px] h-[46px] rounded-xl bg-purple-600 hover:bg-purple-500 disabled:bg-slate-700 disabled:text-slate-500 text-white flex items-center justify-center transition-all cursor-pointer disabled:cursor-not-allowed"
                title="Generate image"
              >
                <ImageIcon size={16} />
              </button>
            )
          ) : loading ? (
            <button
              onClick={() => abortRef.current?.abort()}
              className="flex-shrink-0 w-[46px] h-[46px] rounded-xl bg-red-500/20 hover:bg-red-500/40 border border-red-500/30 text-red-400 flex items-center justify-center transition-all cursor-pointer"
              title="Stop (kills server-side job)"
            >
              <Square size={15} fill="currentColor" />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!online || !input.trim()}
              className="flex-shrink-0 w-[46px] h-[46px] rounded-xl bg-indigo-500 hover:bg-indigo-400 disabled:bg-slate-700 disabled:text-slate-500 text-white flex items-center justify-center transition-all cursor-pointer disabled:cursor-not-allowed"
            >
              <Send size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
