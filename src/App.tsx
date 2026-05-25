import { useEffect, useState, useCallback, useRef } from 'react'
import { healthCheck, type ChatMessage } from './api'
import { StatusBar } from './components/StatusBar'
import { Sidebar } from './components/Sidebar'
import { ChatPanel } from './components/ChatPanel'
import { MemoryPanel } from './components/MemoryPanel'
import { LogsPanel } from './components/LogsPanel'
import { RunsPanel } from './components/RunsPanel'
import { StatsBar } from './components/StatsBar'
import { SettingsModal } from './components/SettingsModal'
import { ToastProvider, useToast } from './components/Toast'
import { PanelLeft, PanelRight, MemoryStick, Settings, ScrollText, Clock, Trash2, Plus, Send, Check, AlertCircle, Search, History } from 'lucide-react'
import { sendLineMessage } from './api'

interface DisplayMessage {
  id: string
  role: 'user' | 'assistant' | 'error'
  content: string
  timestamp: Date
  tokens?: number
}

interface SavedSession {
  id: string
  label: string
  createdAt: string
  display: DisplayMessage[]
  history: ChatMessage[]
}

const SESSIONS_KEY = 'hermes_sessions'

function loadSessions(): SavedSession[] {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY)
    if (!raw) return []
    const sessions: SavedSession[] = JSON.parse(raw)
    // Revive Date objects
    return sessions.map(s => ({
      ...s,
      display: s.display.map(m => ({ ...m, timestamp: new Date(m.timestamp) })),
    }))
  } catch {
    return []
  }
}

function saveSessions(sessions: SavedSession[]) {
  try {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions))
  } catch { /* quota exceeded — ignore */ }
}

function AppInner() {
  const [online, setOnline] = useState(false)
  const [sessionId, setSessionId] = useState<string>(() => crypto.randomUUID())
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [rightPanel, setRightPanel] = useState<'memory' | 'logs' | 'runs' | null>('memory')
  const [statsRefreshKey, setStatsRefreshKey] = useState(0)
  const [selectedModel, setSelectedModel] = useState('hermes-agent')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historySearch, setHistorySearch] = useState('')
  const [notifyOpen, setNotifyOpen] = useState(false)
  const [notifyMsg, setNotifyMsg] = useState('')
  const [notifySending, setNotifySending] = useState(false)
  const [notifyStatus, setNotifyStatus] = useState<'idle' | 'sent' | 'error'>('idle')
  const [notifyError, setNotifyError] = useState('')
  const [sessions, setSessions] = useState<SavedSession[]>(loadSessions)
  const [activeDisplay, setActiveDisplay] = useState<DisplayMessage[]>([])
  const [activeHistory, setActiveHistory] = useState<ChatMessage[]>([])
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { toast } = useToast()
  const prevOnline = useRef<boolean | null>(null)

  const poll = useCallback(async () => {
    const isOnline = await healthCheck()
    setOnline(isOnline)
    if (prevOnline.current !== null && prevOnline.current !== isOnline) {
      if (!isOnline) toast('Gateway went offline', 'error')
      else toast('Gateway reconnected', 'success')
    }
    prevOnline.current = isOnline
  }, [toast])

  useEffect(() => {
    poll()
    const interval = setInterval(poll, 5000)
    return () => clearInterval(interval)
  }, [poll])

  // Debounced save whenever messages change
  const handleMessagesUpdate = useCallback((display: DisplayMessage[], history: ChatMessage[]) => {
    setActiveDisplay(display)
    setActiveHistory(history)
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(() => {
      setSessions(prev => {
        const existing = prev.find(s => s.id === sessionId)
        const firstUserMsg = display.find(m => m.role === 'user')?.content ?? ''
        const label = firstUserMsg ? firstUserMsg.slice(0, 40) + (firstUserMsg.length > 40 ? '…' : '') : 'New session'
        const updated: SavedSession = {
          id: sessionId,
          label,
          createdAt: existing?.createdAt ?? new Date().toISOString(),
          display,
          history,
        }
        const without = prev.filter(s => s.id !== sessionId)
        const next = [updated, ...without].slice(0, 50) // keep max 50 sessions
        saveSessions(next)
        return next
      })
    }, 800)
  }, [sessionId])

  const switchSession = (id: string) => {
    setSessionId(id)
    const saved = sessions.find(s => s.id === id)
    setActiveDisplay(saved?.display ?? [])
    setActiveHistory(saved?.history ?? [])
    setHistoryOpen(false)
  }

  const newSession = () => {
    const id = crypto.randomUUID()
    setSessionId(id)
    setActiveDisplay([])
    setActiveHistory([])
    setHistoryOpen(false)
  }

  const handleNotifySend = async () => {
    if (!notifyMsg.trim() || notifySending) return
    setNotifySending(true)
    setNotifyStatus('idle')
    try {
      const result = await sendLineMessage(notifyMsg.trim())
      if (result.ok) {
        setNotifyStatus('sent')
        setNotifyMsg('')
        setTimeout(() => setNotifyStatus('idle'), 3000)
      } else {
        setNotifyStatus('error')
        setNotifyError(result.error ?? 'ส่งไม่สำเร็จ')
      }
    } catch (e) {
      setNotifyStatus('error')
      setNotifyError(e instanceof Error ? e.message : 'ส่งไม่สำเร็จ')
    } finally {
      setNotifySending(false)
    }
  }

  const deleteSession = (id: string) => {
    setSessions(prev => {
      const next = prev.filter(s => s.id !== id)
      saveSessions(next)
      return next
    })
    if (id === sessionId) newSession()
  }

  // Find active session saved data
  const currentSaved = sessions.find(s => s.id === sessionId)
  const initialDisplay = activeDisplay.length > 0 ? activeDisplay : (currentSaved?.display ?? [])
  const initialHistory = activeHistory.length > 0 ? activeHistory : (currentSaved?.history ?? [])

  return (
    <div className="h-screen w-screen flex flex-col bg-[#0a0a0f] overflow-hidden">
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      <StatusBar />


      {/* Toolbar */}
      <div className="flex items-center gap-1 px-3 py-1.5 bg-[#0c0c13] border-b border-slate-800/40">
        <button
          onClick={() => setSidebarOpen(v => !v)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-all cursor-pointer ${
            sidebarOpen ? 'bg-slate-700/50 text-slate-200' : 'text-slate-600 hover:text-slate-300'
          }`}
          title="Toggle sidebar"
        >
          <PanelLeft size={13} />
          Sidebar
        </button>

        {/* History button */}
        <div className="relative">
          <button
            onClick={() => { setHistoryOpen(v => !v); setHistorySearch('') }}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-all cursor-pointer ${
              historyOpen ? 'bg-slate-700/50 text-slate-200' : 'text-slate-600 hover:text-slate-300'
            }`}
            title="Chat history"
          >
            <Clock size={13} />
            History
            {sessions.length > 0 && (
              <span className="bg-indigo-500/30 text-indigo-300 text-[9px] px-1 rounded-full">{sessions.length}</span>
            )}
          </button>

          {historyOpen && (
            <div className="absolute left-0 top-full mt-1 w-72 bg-[#12121a] border border-slate-700/60 rounded-xl shadow-2xl overflow-hidden z-50">
              <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700/40">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Chat History</p>
                <button
                  onClick={newSession}
                  className="flex items-center gap-1 text-[10px] text-indigo-400 hover:text-indigo-300 cursor-pointer transition-colors"
                >
                  <Plus size={10} /> New
                </button>
              </div>
              <div className="px-2 py-1.5 border-b border-slate-700/40">
                <div className="relative">
                  <Search size={10} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none" />
                  <input
                    autoFocus
                    value={historySearch}
                    onChange={e => setHistorySearch(e.target.value)}
                    placeholder="Search sessions…"
                    className="w-full bg-slate-800/60 border border-slate-700/40 rounded-lg pl-6 pr-2 py-1 text-[11px] text-slate-300 placeholder-slate-600 focus:outline-none focus:border-indigo-500/50"
                  />
                </div>
              </div>
              <div className="max-h-64 overflow-y-auto py-1">
                {sessions.length === 0 && (
                  <p className="text-[11px] text-slate-600 text-center py-4">No history yet</p>
                )}
                {sessions.filter(s =>
                  !historySearch.trim() ||
                  s.label.toLowerCase().includes(historySearch.toLowerCase()) ||
                  s.display.some(m => m.content.toLowerCase().includes(historySearch.toLowerCase()))
                ).map(s => (
                  <div
                    key={s.id}
                    className={`flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-slate-700/30 transition-colors group ${
                      s.id === sessionId ? 'bg-slate-800/50' : ''
                    }`}
                    onClick={() => switchSession(s.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs truncate ${s.id === sessionId ? 'text-indigo-300' : 'text-slate-300'}`}>
                        {s.label}
                      </p>
                      <p className="text-[10px] text-slate-600">
                        {new Date(s.createdAt).toLocaleDateString()} · {s.display.filter(m => m.role === 'user').length} turns
                      </p>
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); deleteSession(s.id) }}
                      className="opacity-0 group-hover:opacity-100 p-1 text-slate-600 hover:text-red-400 transition-all cursor-pointer"
                      title="Delete session"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Notify LINE */}
        <div className="relative">
          <button
            onClick={() => { setNotifyOpen(v => !v); setNotifyStatus('idle'); setNotifyError('') }}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-all cursor-pointer ${
              notifyOpen ? 'bg-green-700/40 text-green-300' : 'text-slate-600 hover:text-slate-300'
            }`}
            title="Send LINE notification"
          >
            <Send size={13} className="text-green-400" />
            Notify LINE
          </button>

          {notifyOpen && (
            <div className="absolute left-0 top-full mt-1 w-80 bg-[#12121a] border border-slate-700/60 rounded-xl shadow-2xl overflow-hidden z-50">
              <div className="px-3 py-2 border-b border-slate-700/40">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Push to LINE</p>
              </div>
              <div className="p-3 space-y-2">
                <textarea
                  autoFocus
                  value={notifyMsg}
                  onChange={e => { setNotifyMsg(e.target.value); setNotifyStatus('idle') }}
                  onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleNotifySend() }}
                  placeholder="พิมพ์ข้อความที่จะส่งไปยัง LINE…"
                  rows={3}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-green-500/50 resize-none"
                />
                {notifyStatus === 'error' && (
                  <div className="flex items-center gap-1.5 text-xs text-red-400">
                    <AlertCircle size={11} />
                    {notifyError}
                  </div>
                )}
                {notifyStatus === 'sent' && (
                  <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                    <Check size={11} />
                    ส่งไปยัง LINE แล้ว
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-700">Cmd+Enter เพื่อส่ง</span>
                  <button
                    onClick={handleNotifySend}
                    disabled={notifySending || !notifyMsg.trim()}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs rounded-lg transition-colors cursor-pointer"
                  >
                    <Send size={11} />
                    {notifySending ? 'กำลังส่ง…' : 'ส่ง'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="ml-auto flex items-center gap-1">
          {/* Right panel toggles */}
          <button
            onClick={() => setRightPanel(p => p === 'memory' ? null : 'memory')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-all cursor-pointer ${
              rightPanel === 'memory' ? 'bg-slate-700/50 text-slate-200' : 'text-slate-600 hover:text-slate-300'
            }`}
            title="Toggle memory panel"
          >
            <MemoryStick size={13} />
            Memory
          </button>
          <button
            onClick={() => setRightPanel(p => p === 'logs' ? null : 'logs')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-all cursor-pointer ${
              rightPanel === 'logs' ? 'bg-slate-700/50 text-slate-200' : 'text-slate-600 hover:text-slate-300'
            }`}
            title="Toggle logs panel"
          >
            <ScrollText size={13} />
            Logs
          </button>
          <button
            onClick={() => setRightPanel(p => p === 'runs' ? null : 'runs')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-all cursor-pointer ${
              rightPanel === 'runs' ? 'bg-slate-700/50 text-slate-200' : 'text-slate-600 hover:text-slate-300'
            }`}
            title="Toggle run history panel"
          >
            <History size={13} />
            Runs
          </button>
          <div className="w-px h-4 bg-slate-700/50 mx-1" />
          <button
            onClick={() => setSettingsOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs text-slate-500 hover:text-slate-300 hover:bg-slate-700/40 transition-all cursor-pointer"
            title="Model settings"
          >
            <Settings size={13} />
            Settings
          </button>
          <button
            onClick={() => setRightPanel(p => p !== null ? null : 'memory')}
            className={`p-1.5 rounded-lg text-xs transition-all cursor-pointer ${
              rightPanel !== null ? 'bg-slate-700/50 text-slate-300' : 'text-slate-600 hover:text-slate-400'
            }`}
            title="Toggle right panel"
          >
            <PanelRight size={13} />
          </button>
        </div>
      </div>

      <StatsBar selectedModel={selectedModel} refreshKey={statsRefreshKey} />

      {/* Main layout */}
      <div className="flex-1 flex overflow-hidden" onClick={() => { if (historyOpen) setHistoryOpen(false); if (notifyOpen) setNotifyOpen(false) }}>
        {sidebarOpen && (
          <div className="w-64 flex-shrink-0 overflow-hidden">
            <Sidebar
              sessionId={sessionId}
              onSessionChange={newSession}
              online={online}
            />
          </div>
        )}

        <div className="flex-1 overflow-hidden">
          <ChatPanel
            key={sessionId}
            sessionId={sessionId}
            online={online}
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
            initialDisplay={initialDisplay}
            initialHistory={initialHistory}
            onMessagesUpdate={handleMessagesUpdate}
            onRunSaved={() => setStatsRefreshKey(k => k + 1)}
          />
        </div>

        {rightPanel === 'memory' && (
          <div className="w-72 flex-shrink-0 overflow-hidden">
            <MemoryPanel online={online} />
          </div>
        )}
        {rightPanel === 'logs' && (
          <div className="w-80 flex-shrink-0 overflow-hidden">
            <LogsPanel />
          </div>
        )}
        {rightPanel === 'runs' && (
          <div className="w-72 flex-shrink-0 overflow-hidden">
            <RunsPanel refreshKey={statsRefreshKey} />
          </div>
        )}
      </div>
    </div>
  )
}

function App() {
  return (
    <ToastProvider>
      <AppInner />
    </ToastProvider>
  )
}

export default App
