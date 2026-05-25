import { createContext, useContext, useState, useCallback, useRef } from 'react'
import { CheckCircle, XCircle, AlertCircle, Info, X } from 'lucide-react'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

interface Toast {
  id: string
  message: string
  type: ToastType
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} })

export function useToast() {
  return useContext(ToastContext)
}

const ICONS = {
  success: <CheckCircle size={14} className="text-emerald-400 flex-shrink-0" />,
  error: <XCircle size={14} className="text-red-400 flex-shrink-0" />,
  warning: <AlertCircle size={14} className="text-amber-400 flex-shrink-0" />,
  info: <Info size={14} className="text-indigo-400 flex-shrink-0" />,
}

const COLORS = {
  success: 'bg-emerald-500/10 border-emerald-500/20',
  error: 'bg-red-500/10 border-red-500/20',
  warning: 'bg-amber-500/10 border-amber-500/20',
  info: 'bg-indigo-500/10 border-indigo-500/20',
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
    clearTimeout(timers.current[id])
    delete timers.current[id]
  }, [])

  const toast = useCallback((message: string, type: ToastType = 'info') => {
    const id = crypto.randomUUID()
    setToasts(prev => [...prev.slice(-4), { id, message, type }])
    timers.current[id] = setTimeout(() => removeToast(id), type === 'error' ? 6000 : 3500)
  }, [removeToast])

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Toast container */}
      <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`flex items-center gap-2.5 pl-3 pr-2 py-2.5 rounded-xl border text-xs text-slate-200 shadow-2xl pointer-events-auto ${COLORS[t.type]}`}
            style={{
              backdropFilter: 'blur(12px)',
              background: 'rgba(13,13,20,0.85)',
              animation: 'toastIn 0.18s ease-out',
            }}
          >
            {ICONS[t.type]}
            <span className="flex-1 max-w-64">{t.message}</span>
            <button
              onClick={() => removeToast(t.id)}
              className="p-0.5 text-slate-600 hover:text-slate-300 transition-colors cursor-pointer flex-shrink-0"
            >
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
