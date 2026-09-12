import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { cp, mkdtemp, rm } from 'node:fs/promises'
import http from 'node:http'
import net from 'node:net'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import WebSocket from '../server/node_modules/ws/wrapper.mjs'

// All storage resolves below this temporary copy of the compiled backend.
// No real data, credentials or .env files are loaded by the child process.
const serverRoot = fileURLToPath(new URL('../server/', import.meta.url))
const runtimeRoot = await mkdtemp(join(serverRoot, '.audit-runtime-'))
const sockets = []
let child
let childClosed
let output = ''

async function choosePort() {
  const probe = net.createServer()
  probe.listen(0, '127.0.0.1')
  await once(probe, 'listening')
  const port = probe.address().port
  await new Promise((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()))
  return port
}

function request(port, path, { method = 'GET', headers = {}, body = '' } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path, method, headers }, (response) => {
      const chunks = []
      response.on('data', (chunk) => chunks.push(chunk))
      response.on('error', reject)
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        let payload
        try { payload = JSON.parse(text) } catch { payload = text }
        resolve({ status: response.statusCode, headers: response.headers, payload })
      })
    })
    req.setTimeout(5000, () => req.destroy(new Error('Smoke HTTP request timed out')))
    req.on('error', reject)
    req.end(body)
  })
}

function nextEvent(socket, type, send) {
  return new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timeout); socket.off('message', onMessage); socket.off('error', onError) }
    const onError = (error) => { cleanup(); reject(error) }
    const onMessage = (raw) => {
      const event = JSON.parse(String(raw))
      if (event.type !== type) return
      cleanup(); resolve(event.payload)
    }
    const timeout = setTimeout(() => onError(new Error('No ' + type + ' event')), 5000)
    socket.on('message', onMessage); socket.on('error', onError)
    send()
  })
}

async function connect(port, name) {
  const socket = new WebSocket('ws://127.0.0.1:' + port + '/ws')
  sockets.push(socket)
  await once(socket, 'open')
  const welcome = await nextEvent(socket, 'welcome', () => socket.send(JSON.stringify({
    type: 'hello', payload: { deviceName: name, platform: 'smoke', autoConnect: false },
  })))
  return { socket, welcome }
}

try {
  await cp(join(serverRoot, 'dist'), join(runtimeRoot, 'dist'), { recursive: true })
  const port = await choosePort()
  const env = Object.fromEntries(['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP'].flatMap((key) =>
    process.env[key] ? [[key, process.env[key]]] : []))
  child = spawn(process.execPath, [join(runtimeRoot, 'dist', 'index.js')], {
    cwd: runtimeRoot, windowsHide: true, env: { ...env, NODE_ENV: 'test', HOST: '127.0.0.1', PORT: String(port), HISTORY_PAGE_SIZE: '2' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  childClosed = once(child, 'close')
  child.stdout.on('data', (chunk) => { output += chunk })
  child.stderr.on('data', (chunk) => { output += chunk })
  let ready = false
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error('Isolated server exited: ' + output)
    try { ready = (await request(port, '/health')).status === 200 } catch { /* still starting */ }
    if (ready) break
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  assert.ok(ready, 'Isolated server must start')
  for (const path of ['/api/history/download/%', '/api/history/file/%E0%A4%A', '/api/admin/roles/%FF', '/api/ocr/jobs/%GG']) {
    assert.equal((await request(port, path)).status, 400, path)
    assert.equal((await request(port, '/health')).status, 200, 'Server must survive malformed URLs')
  }
  assert.equal((await request(port, '/health', { headers: { host: 'bad host' } })).status, 200)
  const { socket, welcome } = await connect(port, 'Smoke sender')
  for (const frame of ['null', JSON.stringify({ type: 'hello' }), JSON.stringify({ type: 'unknown' })]) {
    const error = await nextEvent(socket, 'error', () => socket.send(frame))
    assert.equal(error.code, 'BAD_EVENT')
  }
  const stillConnected = await nextEvent(socket, 'directory-snapshot', () => socket.send(JSON.stringify({ type: 'request-snapshot' })))
  assert.equal(stillConnected.self.deviceId, welcome.self.deviceId)
  const room = stillConnected.rooms.find((item) => item.isPublic)
  assert.ok(room, 'Default public room must be available')
  const headers = { authorization: 'Bearer ' + welcome.self.historyAuthToken, 'content-type': 'application/json' }
  for (const body of ['null', '{', JSON.stringify({ historyId: 'invalid', roomId: room.roomId, text: {} })]) {
    assert.equal((await request(port, '/api/history/text', { method: 'POST', headers, body })).status, 400)
  }
  const textBody = JSON.stringify({ historyId: 'smoke-text', roomId: room.roomId, text: 'Smoke message', createdAt: new Date().toISOString() })
  assert.equal((await request(port, '/api/history/text', { method: 'POST', headers, body: textBody })).status, 200)
  for (const id of ['smoke-text-2', 'smoke-text-3']) {
    assert.equal((await request(port, '/api/history/text', { method: 'POST', headers,
      body: JSON.stringify({ ...JSON.parse(textBody), historyId: id }) })).status, 200)
  }
  const page = await request(port, '/api/history/text?roomId=' + room.roomId + '&limit=not-a-number', { headers })
  assert.equal(page.status, 200)
  assert.equal(page.payload.texts.length, 2, 'Invalid limit must not return the entire history')
  const second = await connect(port, 'Smoke other sender')
  assert.equal((await request(port, '/api/history/text', { method: 'POST',
    headers: { ...headers, authorization: 'Bearer ' + second.welcome.self.historyAuthToken }, body: textBody })).status, 409)
  const fileHeaders = { authorization: headers.authorization, 'content-type': 'application/octet-stream', 'x-file-name': 'smoke.bin' }
  const uploadPath = '/api/history/upload?roomId=' + room.roomId + '&historyId=smoke-file'
  const upload = await request(port, uploadPath, { method: 'POST', headers: { ...fileHeaders, 'content-range': 'bytes 0-3/4' }, body: 'ABCD' })
  assert.equal(upload.status, 200)
  assert.equal(upload.payload.complete, true)
  assert.equal((await request(port, uploadPath, { method: 'POST', headers: { ...fileHeaders,
    authorization: 'Bearer ' + second.welcome.self.historyAuthToken, 'content-range': 'bytes 0-3/4' }, body: 'EVIL' })).status, 409)
  const download = await request(port, '/api/history/download/smoke-file', { headers: { range: 'bytes=1-2' } })
  assert.equal(download.status, 206)
  assert.equal(download.payload, 'BC')
  assert.equal((await request(port, uploadPath + '-html', { method: 'POST',
    headers: { ...fileHeaders, 'content-type': 'text/html', 'x-file-name': 'fake.pdf' }, body: '<p>not a pdf</p>' })).status, 200)
  const unsafeFile = await request(port, '/api/history/download/smoke-file-html')
  assert.ok(unsafeFile.headers['content-disposition'].startsWith('attachment;'))
  assert.equal(unsafeFile.headers['x-content-type-options'], 'nosniff')
  assert.equal((await request(port, uploadPath + '-oversize', { method: 'POST',
    headers: { ...fileHeaders, 'content-range': 'bytes 0-16777215/16777216' } })).status, 413)
  assert.equal((await request(port, '/health')).payload.ok, true)
  console.log('Server smoke passed: malformed HTTP/WS input, connection identity, history validation, sender isolation, chunk upload and ranged download.')
} finally {
  for (const socket of sockets) socket.terminate()
  if (child && child.exitCode === null) { child.kill(); await childClosed }
  // Only remove the exact directory returned by mkdtemp above.
  assert.equal(dirname(runtimeRoot), resolve(serverRoot))
  await rm(runtimeRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}
