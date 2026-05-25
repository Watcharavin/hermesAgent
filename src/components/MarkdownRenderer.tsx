import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import type { Components } from 'react-markdown'

interface Props {
  content: string
}

export function MarkdownRenderer({ content }: Props) {
  const components: Components = {
    code({ className, children, ...props }) {
      const match = /language-(\w+)/.exec(className || '')
      const isBlock = !!match
      if (isBlock) {
        return (
          <SyntaxHighlighter
            style={vscDarkPlus}
            language={match![1]}
            PreTag="div"
            customStyle={{
              margin: '0.75rem 0',
              borderRadius: '8px',
              border: '1px solid #1e293b',
              fontSize: '0.82rem',
              background: '#0d1117',
            }}
          >
            {String(children).replace(/\n$/, '')}
          </SyntaxHighlighter>
        )
      }
      return (
        <code
          className="bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-cyan-300 text-[0.82em] font-mono"
          {...props}
        >
          {children}
        </code>
      )
    },
  }

  return (
    <div className="prose-dark text-slate-300 text-sm leading-relaxed">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  )
}
