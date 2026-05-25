import { useEffect, useState, useCallback } from 'react'
import { X, Save, RefreshCw, AlertCircle, Check, ChevronDown, Eye, EyeOff } from 'lucide-react'

interface Provider {
  id: string
  label: string
  url: string
}

interface ConfigData {
  default: string
  provider: string
  base_url: string
  error?: string
}

interface Props {
  onClose: () => void
}

export function SettingsModal({ onClose }: Props) {
  const [providers, setProviders] = useState<Provider[]>([])
  const [config, setConfig] = useState<ConfigData>({ default: '', provider: '', base_url: '' })
  const [model, setModel] = useState('')
  const [provider, setProvider] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [providerOpen, setProviderOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [pRes, cRes] = await Promise.all([
        fetch('/config-api/providers'),
        fetch('/config-api/config'),
      ])
      const p: Provider[] = await pRes.json()
      const c: ConfigData = await cRes.json()
      setProviders(p)
      setConfig(c)
      setModel(c.default || '')
      setProvider(c.provider || '')
      setBaseUrl(c.base_url || '')
    } catch (e) {
      setError('Config server not running. Start it with: node config-server.cjs')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Auto-fill base_url when provider changes
  const handleProviderSelect = (p: Provider) => {
    setProvider(p.id)
    if (p.url) setBaseUrl(p.url)
    setProviderOpen(false)
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/config-api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          provider,
          base_url: baseUrl,
          ...(apiKey ? { api_key: apiKey } : {}),
          restart: true,
        }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error ?? 'Save failed')
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const selectedProvider = providers.find(p => p.id === provider)
  const hasChanges = model !== config.default || provider !== config.provider || baseUrl !== config.base_url || apiKey !== ''

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-md mx-4 bg-[#0f0f18] border border-slate-700/60 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800/60">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">Model Settings</h2>
            <p className="text-xs text-slate-500 mt-0.5">Changes apply after gateway restart</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors cursor-pointer">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <RefreshCw size={16} className="animate-spin text-slate-600" />
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
              <AlertCircle size={12} className="flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {!loading && (
            <>
              {/* Provider */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Provider</label>
                <div className="relative">
                  <button
                    onClick={() => setProviderOpen(v => !v)}
                    className="w-full flex items-center justify-between px-3 py-2.5 bg-slate-800/60 border border-slate-700/50 rounded-xl text-sm text-slate-200 hover:border-slate-600 transition-all cursor-pointer"
                  >
                    <span>{selectedProvider?.label ?? provider ?? 'Select provider'}</span>
                    <ChevronDown size={13} className={`text-slate-500 transition-transform ${providerOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {providerOpen && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-[#12121a] border border-slate-700/60 rounded-xl shadow-2xl z-10 overflow-hidden">
                      {providers.map(p => (
                        <button
                          key={p.id}
                          onClick={() => handleProviderSelect(p)}
                          className="w-full flex items-center justify-between px-3 py-2.5 text-sm hover:bg-slate-700/40 transition-colors cursor-pointer text-left"
                        >
                          <span className={p.id === provider ? 'text-indigo-300' : 'text-slate-300'}>{p.label}</span>
                          {p.id === provider && <Check size={12} className="text-indigo-400" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Model */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Model</label>
                <input
                  type="text"
                  value={model}
                  onChange={e => setModel(e.target.value)}
                  placeholder="e.g. anthropic/claude-haiku-4-5-20251001"
                  className="w-full px-3 py-2.5 bg-slate-800/60 border border-slate-700/50 rounded-xl text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500/50 transition-all font-mono"
                />
                <p className="text-[10px] text-slate-600 mt-1">
                  Current: <span className="text-slate-500 font-mono">{config.default || '—'}</span>
                </p>
              </div>

              {/* Base URL */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Base URL</label>
                <input
                  type="text"
                  value={baseUrl}
                  onChange={e => setBaseUrl(e.target.value)}
                  placeholder="https://openrouter.ai/api/v1"
                  className="w-full px-3 py-2.5 bg-slate-800/60 border border-slate-700/50 rounded-xl text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500/50 transition-all font-mono text-xs"
                />
              </div>

              {/* API Key */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  API Key <span className="text-slate-600">(leave blank to keep current)</span>
                </label>
                <div className="relative">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={e => setApiKey(e.target.value)}
                    placeholder="sk-..."
                    className="w-full px-3 py-2.5 pr-10 bg-slate-800/60 border border-slate-700/50 rounded-xl text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500/50 transition-all font-mono"
                  />
                  <button
                    onClick={() => setShowKey(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400 cursor-pointer"
                  >
                    {showKey ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>
              </div>

              {/* Restart notice */}
              <div className="text-xs text-slate-600 bg-slate-800/30 border border-slate-700/30 rounded-lg px-3 py-2">
                Gateway will restart automatically after saving
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {!loading && (
          <div className="flex items-center justify-between px-5 py-4 border-t border-slate-800/60">
            <button onClick={onClose} className="text-xs text-slate-500 hover:text-slate-300 transition-colors cursor-pointer">
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !hasChanges}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-500 hover:bg-indigo-400 disabled:bg-slate-700 disabled:text-slate-500 text-white text-xs font-medium rounded-xl transition-all cursor-pointer disabled:cursor-not-allowed"
            >
              {saving ? (
                <><RefreshCw size={12} className="animate-spin" /> Saving…</>
              ) : saved ? (
                <><Check size={12} /> Saved & Restarting</>
              ) : (
                <><Save size={12} /> Save & Restart</>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
