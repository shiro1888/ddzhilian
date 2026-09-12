import { createReadStream, existsSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const outDir = resolve(fileURLToPath(new URL('../out/', import.meta.url)))
const port = Number(process.env.PORT || 4173)

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.wasm', 'application/wasm'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
  ['.webp', 'image/webp'],
  ['.ico', 'image/x-icon'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.txt', 'text/plain; charset=utf-8'],
])

function resolveRequestPath(url) {
  const pathname = decodeURIComponent(new URL(url, `http://localhost:${port.toString()}`).pathname)
  const directPath = resolve(outDir, '.' + pathname)
  if (directPath !== outDir && !directPath.startsWith(outDir + sep)) return null

  if (existsSync(directPath)) {
    const indexPath = join(directPath, 'index.html')
    if (existsSync(indexPath)) {
      return indexPath
    }

    if (existsSync(`${directPath}.html`)) {
      return `${directPath}.html`
    }

    return directPath
  }

  if (existsSync(`${directPath}.html`)) {
    return `${directPath}.html`
  }

  return extname(pathname) ? null : join(outDir, 'index.html')
}

const server = createServer(async (request, response) => {
  let filePath
  try {
    filePath = resolveRequestPath(request.url || '/')
  } catch {
    response.writeHead(400).end('Invalid URL')
    return
  }
  if (!filePath) { response.writeHead(404).end('Not found'); return }
  try {
    const fileStat = await stat(filePath)
    if (!fileStat.isFile()) { response.writeHead(404).end('Not found'); return }
    response.writeHead(200, {
      'content-type': contentTypes.get(extname(filePath)) || 'application/octet-stream',
      'content-length': fileStat.size,
      'x-content-type-options': 'nosniff',
    })
    if (request.method === 'HEAD') { response.end(); return }
    const stream = createReadStream(filePath)
    stream.on('error', () => response.destroy())
    response.on('close', () => stream.destroy())
    stream.pipe(response)
  } catch {
    if (!response.headersSent) response.writeHead(404).end('Not found')
    else response.destroy()
  }
})

server.listen(port, '127.0.0.1', () => {
  console.log(`Serving Next export at http://127.0.0.1:${port.toString()}`)
})
