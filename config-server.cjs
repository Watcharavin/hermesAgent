/**
 * Local config server — port 8643
 * Reads ~/.hermes/config.yaml and runs `hermes config set` to update values.
 * Proxied by Vite as /config-api/*
 */
const http = require('http')
const https = require('https')
const { execSync, spawn } = require('child_process')
const fs = require('fs')
const path = require('path')

const PORT = process.env.CONFIG_SERVER_PORT || 8643
const HERMES_BIN = process.env.HERMES_BIN || path.join(process.env.HOME, '.hermes', 'hermes-agent', 'venv', 'bin', 'hermes')
const CONFIG_PATH = path.join(process.env.HOME, '.hermes', 'config.yaml')
const MEMORIES_DIR = path.join(process.env.HOME, '.hermes', 'memories')
const HERMES_ENV_PATH = path.join(process.env.HOME, '.hermes', '.env')
const LOG_FILES = {
  gateway: '/tmp/hermes-gateway.log',
  cloudflared: '/tmp/hermes-cloudflared-line.log',
  configserver: '/tmp/hermes-config-server.log',
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json',
}

const PROVIDERS = [
  { id: 'openrouter', label: 'OpenRouter', url: 'https://openrouter.ai/api/v1' },
  { id: 'anthropic', label: 'Anthropic', url: 'https://api.anthropic.com/v1' },
  { id: 'openai', label: 'OpenAI', url: 'https://api.openai.com/v1' },
  { id: 'ollama', label: 'Ollama (local)', url: 'http://localhost:11434/v1' },
  { id: 'lmstudio', label: 'LM Studio (local)', url: 'http://localhost:1234/v1' },
  { id: 'gemini', label: 'Google Gemini', url: 'https://generativelanguage.googleapis.com/v1beta/openai' },
  { id: 'nous', label: 'Nous Portal', url: '' },
  { id: 'custom', label: 'Custom', url: '' },
]

function readHermesEnv() {
  try {
    const raw = fs.readFileSync(HERMES_ENV_PATH, 'utf8')
    const env = {}
    for (const line of raw.split('\n')) {
      const m = line.match(/^([A-Z_]+)=(.*)$/)
      if (m) env[m[1]] = m[2].trim()
    }
    return env
  } catch {
    return {}
  }
}

function kieApiRequest(method, path, body, apiKey) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : ''
    const opts = {
      hostname: 'api.kie.ai',
      port: 443,
      path,
      method,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    }
    const req = https.request(opts, res => {
      let buf = ''
      res.on('data', d => { buf += d })
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(buf) }) }
        catch { resolve({ status: res.statusCode, body: buf }) }
      })
    })
    req.on('error', reject)
    if (data) req.write(data)
    req.end()
  })
}

function lineApiRequest(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body)
    const opts = {
      hostname: 'api.line.me',
      port: 443,
      path,
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    }
    const req = https.request(opts, res => {
      let buf = ''
      res.on('data', d => { buf += d })
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(buf) }) }
        catch { resolve({ status: res.statusCode, body: buf }) }
      })
    })
    req.on('error', reject)
    req.write(data)
    req.end()
  })
}

function readConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8')
    const lines = raw.split('\n')
    const config = { default: '', provider: '', base_url: '' }
    let inModel = false
    for (const line of lines) {
      if (line.startsWith('model:')) { inModel = true; continue }
      if (inModel && line.match(/^\S/) && !line.startsWith('model:')) { inModel = false }
      if (inModel) {
        const m = line.match(/^\s+(\w+):\s*(.*)/)
        if (m) config[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '')
      }
    }
    return config
  } catch (e) {
    return { default: '', provider: '', base_url: '', error: e.message }
  }
}

function hermesSet(key, value) {
  // Reject shell metacharacters to prevent command injection
  if (/[`$\\|;&<>]/.test(value)) {
    console.error('hermesSet: rejected unsafe value')
    return false
  }
  try {
    execSync(`"${HERMES_BIN}" config set ${key} "${value}"`, {
      timeout: 10000,
      stdio: 'pipe',
      env: { ...process.env, PATH: `${path.dirname(HERMES_BIN)}:${process.env.PATH}` }
    })
    return true
  } catch (e) {
    console.error('hermes config set failed:', e.message)
    return false
  }
}

function restartGateway() {
  try {
    // Force-kill any running gateway processes
    try { execSync('pkill -9 -f "hermes_cli.main"', { stdio: 'ignore' }) } catch { /* not running */ }
    try { execSync('pkill -9 -f "hermes.*gateway"', { stdio: 'ignore' }) } catch { /* not running */ }
    // Wait for OS to release port then spawn fresh
    setTimeout(() => {
      const child = spawn(HERMES_BIN, ['gateway', 'run', '--replace'], {
        detached: true,
        stdio: ['ignore', fs.openSync('/tmp/hermes-gateway.log', 'a'), fs.openSync('/tmp/hermes-gateway.log', 'a')],
        env: { ...process.env, PATH: `${path.dirname(HERMES_BIN)}:${process.env.PATH}` }
      })
      child.unref()
      console.log('Gateway spawned PID:', child.pid)
    }, 2500)
    return true
  } catch (e) {
    console.error('restartGateway failed:', e.message)
    return false
  }
}

http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(200, CORS)
    return res.end()
  }

  const url = req.url.split('?')[0]

  if (url === '/config-api/providers' && req.method === 'GET') {
    res.writeHead(200, CORS)
    return res.end(JSON.stringify(PROVIDERS))
  }

  if (url === '/config-api/config' && req.method === 'GET') {
    res.writeHead(200, CORS)
    return res.end(JSON.stringify(readConfig()))
  }

  if (url === '/config-api/config' && req.method === 'POST') {
    let body = ''
    req.on('data', d => { body += d })
    req.on('end', () => {
      try {
        const data = JSON.parse(body)
        const results = {}

        if (data.model !== undefined && data.model !== '') {
          results.model = hermesSet('model.default', data.model)
        }
        if (data.provider !== undefined) {
          results.provider = hermesSet('model.provider', data.provider)
        }
        if (data.base_url !== undefined && data.base_url !== '') {
          results.base_url = hermesSet('model.base_url', data.base_url)
        }
        if (data.api_key !== undefined && data.api_key !== '') {
          results.api_key = hermesSet('model.api_key', data.api_key)
        }

        const shouldRestart = data.restart !== false
        if (shouldRestart) restartGateway()

        res.writeHead(200, CORS)
        res.end(JSON.stringify({ ok: true, results, restarted: shouldRestart }))
      } catch (e) {
        res.writeHead(400, CORS)
        res.end(JSON.stringify({ ok: false, error: e.message }))
      }
    })
    return
  }

  if (url === '/config-api/tunnel-status' && req.method === 'GET') {
    try {
      // Check if ngrok is running
      let running = false
      let tunnelUrl = null
      try {
        execSync('pgrep -f "ngrok.*8646"', { stdio: 'pipe' })
        running = true
        // Get URL from ngrok local API
        const ngrokRes = execSync('curl -s http://localhost:4040/api/tunnels', { timeout: 3000, stdio: 'pipe' }).toString()
        const data = JSON.parse(ngrokRes)
        const https = data.tunnels?.find(t => t.proto === 'https')
        if (https) tunnelUrl = https.public_url
      } catch { }

      res.writeHead(200, CORS)
      return res.end(JSON.stringify({ running, tunnelUrl }))
    } catch (e) {
      res.writeHead(200, CORS)
      return res.end(JSON.stringify({ running: false, tunnelUrl: null }))
    }
  }

  // ── LINE Webhook Update ───────────────────────────────────────────────────
  if (url === '/config-api/update-line-webhook' && req.method === 'POST') {
    let body = ''
    req.on('data', d => { body += d })
    req.on('end', async () => {
      try {
        const { webhookUrl } = JSON.parse(body)
        if (!webhookUrl) throw new Error('webhookUrl is required')
        const env = readHermesEnv()
        const token = env.LINE_CHANNEL_ACCESS_TOKEN
        if (!token) throw new Error('LINE_CHANNEL_ACCESS_TOKEN not found in ~/.hermes/.env')
        const result = await lineApiRequest('PUT', '/v2/bot/channel/webhook/endpoint', { endpoint: webhookUrl }, token)
        if (result.status === 200) {
          res.writeHead(200, CORS)
          res.end(JSON.stringify({ ok: true, webhookUrl }))
        } else {
          res.writeHead(200, CORS)
          res.end(JSON.stringify({ ok: false, error: `LINE API error ${result.status}`, detail: result.body }))
        }
      } catch (e) {
        res.writeHead(400, CORS)
        res.end(JSON.stringify({ ok: false, error: e.message }))
      }
    })
    return
  }

  // ── LINE Push Notification ────────────────────────────────────────────────
  if (url === '/config-api/send-line' && req.method === 'POST') {
    let body = ''
    req.on('data', d => { body += d })
    req.on('end', async () => {
      try {
        const { message, to } = JSON.parse(body)
        if (!message || !message.trim()) throw new Error('message is required')
        const env = readHermesEnv()
        const token = env.LINE_CHANNEL_ACCESS_TOKEN
        if (!token) throw new Error('LINE_CHANNEL_ACCESS_TOKEN not found in ~/.hermes/.env')
        const recipient = to || env.LINE_HOME_CHANNEL
        if (!recipient) throw new Error('No recipient — set LINE_HOME_CHANNEL in .env or provide "to"')
        const result = await lineApiRequest('POST', '/v2/bot/message/push', {
          to: recipient,
          messages: [{ type: 'text', text: message.trim() }],
        }, token)
        if (result.status === 200) {
          res.writeHead(200, CORS)
          res.end(JSON.stringify({ ok: true }))
        } else {
          res.writeHead(200, CORS)
          res.end(JSON.stringify({ ok: false, error: `LINE API ${result.status}`, detail: result.body }))
        }
      } catch (e) {
        res.writeHead(400, CORS)
        res.end(JSON.stringify({ ok: false, error: e.message }))
      }
    })
    return
  }

  // ── Logs ──────────────────────────────────────────────────────────────────
  if (url === '/config-api/logs' && req.method === 'GET') {
    const params = new URLSearchParams(req.url.split('?')[1] || '')
    const source = params.get('source') || 'gateway'
    const lines = Math.min(parseInt(params.get('lines') || '200', 10), 1000)
    const logFile = LOG_FILES[source] || LOG_FILES.gateway
    try {
      const raw = fs.readFileSync(logFile, 'utf8')
      const all = raw.split('\n').filter(Boolean)
      const tail = all.slice(-lines)
      res.writeHead(200, CORS)
      return res.end(JSON.stringify({ lines: tail, source, total: all.length }))
    } catch (e) {
      res.writeHead(200, CORS)
      return res.end(JSON.stringify({ lines: [], source, error: e.message }))
    }
  }

  // ── Memory files ──────────────────────────────────────────────────────────
  if (url === '/config-api/memory' && req.method === 'GET') {
    try {
      const files = fs.readdirSync(MEMORIES_DIR)
        .filter(f => f.endsWith('.md') && !f.endsWith('.lock'))
      res.writeHead(200, CORS)
      return res.end(JSON.stringify({ files }))
    } catch (e) {
      res.writeHead(200, CORS)
      return res.end(JSON.stringify({ files: [], error: e.message }))
    }
  }

  const memMatch = url.match(/^\/config-api\/memory\/(.+)$/)
  if (memMatch) {
    const filename = path.basename(memMatch[1]) // prevent path traversal
    const filePath = path.join(MEMORIES_DIR, filename)
    if (!filePath.startsWith(MEMORIES_DIR)) {
      res.writeHead(403, CORS)
      return res.end(JSON.stringify({ error: 'Forbidden' }))
    }

    if (req.method === 'GET') {
      try {
        const content = fs.readFileSync(filePath, 'utf8')
        res.writeHead(200, CORS)
        return res.end(JSON.stringify({ filename, content }))
      } catch (e) {
        res.writeHead(404, CORS)
        return res.end(JSON.stringify({ error: e.message }))
      }
    }

    if (req.method === 'POST') {
      let body = ''
      req.on('data', d => { body += d })
      req.on('end', () => {
        try {
          const { content } = JSON.parse(body)
          if (typeof content !== 'string') throw new Error('content must be a string')
          fs.writeFileSync(filePath, content, 'utf8')
          res.writeHead(200, CORS)
          res.end(JSON.stringify({ ok: true, filename }))
        } catch (e) {
          res.writeHead(400, CORS)
          res.end(JSON.stringify({ ok: false, error: e.message }))
        }
      })
      return
    }
  }

  // ── KIE Image Generation ─────────────────────────────────────────────────
  if (url === '/config-api/generate-image' && req.method === 'POST') {
    let body = ''
    req.on('data', d => { body += d })
    req.on('end', async () => {
      try {
        const { prompt, aspect_ratio = 'auto', resolution = '1K' } = JSON.parse(body)
        if (!prompt?.trim()) throw new Error('prompt is required')
        const env = readHermesEnv()
        const apiKey = env.KIE_API_KEY
        if (!apiKey) throw new Error('KIE_API_KEY not found in ~/.hermes/.env')
        const payload = { model: 'gpt-image-2-text-to-image', input: { prompt: prompt.trim(), aspect_ratio, resolution } }
        const result = await kieApiRequest('POST', '/api/v1/jobs/createTask', payload, apiKey)
        if (result.status === 200 && result.body.code === 200) {
          res.writeHead(200, CORS)
          res.end(JSON.stringify({ ok: true, taskId: result.body.data.taskId }))
        } else {
          res.writeHead(200, CORS)
          res.end(JSON.stringify({ ok: false, error: result.body.msg || `KIE error ${result.status}` }))
        }
      } catch (e) {
        res.writeHead(400, CORS)
        res.end(JSON.stringify({ ok: false, error: e.message }))
      }
    })
    return
  }

  if (url.startsWith('/config-api/image-status') && req.method === 'GET') {
    const params = new URLSearchParams(req.url.split('?')[1] || '')
    const taskId = params.get('taskId');
    (async () => {
      try {
        if (!taskId) throw new Error('taskId required')
        const env = readHermesEnv()
        const apiKey = env.KIE_API_KEY
        if (!apiKey) throw new Error('KIE_API_KEY not found in ~/.hermes/.env')
        const result = await kieApiRequest('GET', `/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`, null, apiKey)
        res.writeHead(200, CORS)
        res.end(JSON.stringify(result.body))
      } catch (e) {
        res.writeHead(400, CORS)
        res.end(JSON.stringify({ ok: false, error: e.message }))
      }
    })()
    return
  }

  // ── Skills ────────────────────────────────────────────────────────────────
  if (url === '/config-api/skills' && req.method === 'GET') {
    try {
      const SKILLS_DIR = path.join(process.env.HOME, '.hermes', 'skills')
      const skills = []
      const categories = fs.readdirSync(SKILLS_DIR).filter(f => {
        try { return fs.statSync(path.join(SKILLS_DIR, f)).isDirectory() } catch { return false }
      })
      for (const cat of categories) {
        const catDir = path.join(SKILLS_DIR, cat)
        // Read category description
        let catDesc = ''
        try {
          const raw = fs.readFileSync(path.join(catDir, 'DESCRIPTION.md'), 'utf8')
          const m = raw.match(/description:\s*["']?(.+?)["']?\s*\n/)
          if (m) catDesc = m[1].trim()
        } catch { /* no description */ }

        const entries = fs.readdirSync(catDir).filter(f => {
          try { return fs.statSync(path.join(catDir, f)).isDirectory() } catch { return false }
        })
        for (const skillName of entries) {
          const skillFile = path.join(catDir, skillName, 'SKILL.md')
          try {
            const raw = fs.readFileSync(skillFile, 'utf8')
            const descMatch = raw.match(/description:\s*["'](.+?)["']/)
            const nameMatch = raw.match(/^name:\s*(.+)$/m)
            const versionMatch = raw.match(/^version:\s*(.+)$/m)
            const tagsMatch = raw.match(/tags:\s*\[(.+?)\]/)
            skills.push({
              id: `${cat}/${skillName}`,
              category: cat,
              name: nameMatch ? nameMatch[1].trim() : skillName,
              description: descMatch ? descMatch[1].trim() : catDesc,
              version: versionMatch ? versionMatch[1].trim() : null,
              tags: tagsMatch ? tagsMatch[1].split(',').map(t => t.trim().replace(/['"]/g, '')) : [],
            })
          } catch { /* no SKILL.md, skip */ }
        }
      }
      skills.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
      res.writeHead(200, CORS)
      return res.end(JSON.stringify({ skills }))
    } catch (e) {
      res.writeHead(200, CORS)
      return res.end(JSON.stringify({ skills: [], error: e.message }))
    }
  }

  res.writeHead(404, CORS)
  res.end(JSON.stringify({ error: 'Not found' }))
}).listen(PORT, () => {
  console.log(`Config server running at http://localhost:${PORT}`)
})
