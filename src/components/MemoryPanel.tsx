import { useEffect, useState, useCallback } from 'react'
import { getMemoryFiles, getMemoryFile, saveMemoryFile } from '../api'
import { Database, RefreshCw, AlertCircle, Save, FileText, ChevronDown, ChevronRight, Check } from 'lucide-react'

interface Props {
  online: boolean
}

export function MemoryPanel({ online: _online }: Props) {
  const [files, setFiles] = useState<string[]>([])
  const [openFile, setOpenFile] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [originalContent, setOriginalContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [fileLoading, setFileLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadFiles = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await getMemoryFiles()
      setFiles(list)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load memory files')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadFiles() }, [loadFiles])

  const openFileHandler = async (filename: string) => {
    if (openFile === filename) {
      setOpenFile(null)
      return
    }
    setOpenFile(filename)
    setFileLoading(true)
    setError(null)
    try {
      const text = await getMemoryFile(filename)
      setContent(text)
      setOriginalContent(text)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to read file')
    } finally {
      setFileLoading(false)
    }
  }

  const handleSave = async () => {
    if (!openFile) return
    setSaving(true)
    setError(null)
    try {
      await saveMemoryFile(openFile, content)
      setOriginalContent(content)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const isDirty = content !== originalContent

  return (
    <div className="flex flex-col h-full bg-[#0b0b12] border-l border-slate-800/60">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800/60">
        <div className="flex items-center gap-2">
          <Database size={14} className="text-indigo-400" />
          <span className="text-sm font-medium text-slate-200">Memory</span>
        </div>
        <button
          onClick={loadFiles}
          disabled={loading}
          className="p-1.5 text-slate-600 hover:text-slate-400 disabled:opacity-30 transition-colors cursor-pointer"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {error && (
        <div className="mx-3 mt-2 flex items-start gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-2">
          <AlertCircle size={11} className="flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {loading && (
          <div className="flex justify-center py-8">
            <RefreshCw size={16} className="animate-spin text-slate-600" />
          </div>
        )}

        {!loading && files.length === 0 && (
          <p className="text-xs text-slate-600 text-center py-8">No memory files found</p>
        )}

        {files.map(filename => {
          const isOpen = openFile === filename

          return (
            <div key={filename} className="rounded-lg bg-slate-800/30 border border-slate-700/30 overflow-hidden">
              {/* File header */}
              <button
                onClick={() => openFileHandler(filename)}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-slate-800/40 transition-colors cursor-pointer"
              >
                {isOpen ? <ChevronDown size={11} className="text-slate-500 flex-shrink-0" /> : <ChevronRight size={11} className="text-slate-500 flex-shrink-0" />}
                <FileText size={12} className="text-indigo-400 flex-shrink-0" />
                <span className="text-xs font-mono text-slate-200 flex-1 truncate">{filename}</span>
                {isOpen && isDirty && (
                  <span className="text-[9px] bg-amber-500/20 text-amber-400 px-1 rounded flex-shrink-0">unsaved</span>
                )}
              </button>

              {/* File content editor */}
              {isOpen && (
                <div className="border-t border-slate-700/40">
                  {fileLoading ? (
                    <div className="flex justify-center py-4">
                      <RefreshCw size={14} className="animate-spin text-slate-600" />
                    </div>
                  ) : (
                    <>
                      <textarea
                        value={content}
                        onChange={e => setContent(e.target.value)}
                        className="w-full bg-slate-900/60 text-[11px] font-mono text-slate-300 px-3 py-2 resize-none focus:outline-none focus:bg-slate-900/80 border-b border-slate-700/40"
                        rows={Math.min(Math.max(content.split('\n').length, 4), 20)}
                        spellCheck={false}
                      />
                      <div className="flex items-center justify-between px-3 py-2 bg-slate-900/40">
                        <span className="text-[10px] text-slate-700">{content.split('\n').length} lines</span>
                        <button
                          onClick={handleSave}
                          disabled={saving || !isDirty}
                          className="flex items-center gap-1 px-2.5 py-1 rounded text-[11px] bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white cursor-pointer transition-colors"
                        >
                          {saved ? <Check size={10} /> : saving ? <RefreshCw size={10} className="animate-spin" /> : <Save size={10} />}
                          {saved ? 'Saved' : 'Save'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {/* Memory tip */}
        <div className="mt-2 rounded-lg bg-slate-800/20 border border-slate-700/20 px-3 py-2.5">
          <p className="text-[10px] text-slate-600 leading-relaxed">
            Memory files are read by Hermes at the start of each session. Edit them here or ask the agent: <span className="text-slate-500 italic">"Remember that..."</span>
          </p>
        </div>
      </div>
    </div>
  )
}
