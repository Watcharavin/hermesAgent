const http = require('http')

const RESPONSES = {
  health: { status: 'ok', version: '1.0.0' },
  tools: [
    { name: 'bash', enabled: true, description: 'Run shell commands' },
    { name: 'read_file', enabled: true, description: 'Read files from disk' },
    { name: 'web_search', enabled: false, description: 'Search the web' },
    { name: 'write_file', enabled: true, description: 'Write files to disk' },
  ],
  skills: [
    { name: 'code-review', installed: true, description: 'Review code quality' },
    { name: 'debug', installed: false, description: 'Debug issues automatically' },
    { name: 'summarize', installed: true, description: 'Summarize long content' },
  ],
  sessions: [
    { id: 'session-abc123', message_count: 5, updated_at: new Date().toISOString() },
    { id: 'session-def456', message_count: 2, updated_at: new Date(Date.now() - 3600000).toISOString() },
  ],
  memory: {
    user: 'artcu',
    project: 'hermes-dashboard',
    preferences: { theme: 'dark', language: 'th' },
  },
}

http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Content-Type', 'application/json')

  if (req.method === 'OPTIONS') return res.end()

  let body = ''
  req.on('data', chunk => { body += chunk })
  req.on('end', () => {
    const url = req.url.split('?')[0]

    if (url === '/health') return res.end(JSON.stringify(RESPONSES.health))
    if (url === '/tools' && req.method === 'GET') return res.end(JSON.stringify(RESPONSES.tools))
    if (url === '/skills' && req.method === 'GET') return res.end(JSON.stringify(RESPONSES.skills))
    if (url === '/sessions' && req.method === 'GET') return res.end(JSON.stringify(RESPONSES.sessions))
    if (url === '/memory' && req.method === 'GET') return res.end(JSON.stringify(RESPONSES.memory))

    if (url === '/chat' && req.method === 'POST') {
      const parsed = body ? JSON.parse(body) : {}
      const msg = parsed.message || ''
      const reply = `[Mock Agent] ได้รับข้อความ: "${msg}"\n\nนี่คือการตอบกลับจาก Mock Server ครับ`
      return res.end(JSON.stringify({ response: reply, session_id: parsed.session_id }))
    }

    if (url === '/sessions' && req.method === 'POST') {
      const newSession = { id: 'session-' + Date.now(), message_count: 0, updated_at: new Date().toISOString() }
      RESPONSES.sessions.unshift(newSession)
      return res.end(JSON.stringify(newSession))
    }

    if (url === '/memory' && req.method === 'POST') {
      const parsed = body ? JSON.parse(body) : {}
      Object.assign(RESPONSES.memory, parsed)
      return res.end(JSON.stringify({ ok: true }))
    }

    if (url === '/tools' && req.method === 'POST') {
      const parsed = body ? JSON.parse(body) : {}
      if (parsed.tools) RESPONSES.tools = parsed.tools
      return res.end(JSON.stringify({ ok: true }))
    }

    if (url === '/skills' && req.method === 'POST') {
      const parsed = body ? JSON.parse(body) : {}
      RESPONSES.skills = RESPONSES.skills.map(s =>
        s.name === parsed.name ? { ...s, installed: true } : s
      )
      return res.end(JSON.stringify({ ok: true }))
    }

    res.statusCode = 404
    res.end(JSON.stringify({ error: 'Not found' }))
  })
}).listen(8642, () => {
  console.log('Mock Hermes Agent running at http://localhost:8642')
  console.log('Press Ctrl+C to stop')
})
