import { createReadStream, existsSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const outDir = fileURLToPath(new URL('../out/', import.meta.url))
const port = Number(process.env.PORT || 4173)

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.txt', 'text/plain; charset=utf-8'],
])

function resolveRequestPath(url) {
  const pathname = decodeURIComponent(new URL(url, `http://localhost:${port.toString()}`).pathname)
  const safePath = normalize(pathname).replace(/^(\.\.[/\\])+/, '')
  const directPath = join(outDir, safePath)

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

  return join(outDir, 'index.html')
}

const server = createServer(async (request, response) => {
  const filePath = resolveRequestPath(request.url || '/')
  const fileStat = await stat(filePath)
  response.writeHead(200, {
    'content-type': contentTypes.get(extname(filePath)) || 'application/octet-stream',
    'content-length': fileStat.size,
  })
  createReadStream(filePath).pipe(response)
})

server.listen(port, '127.0.0.1', () => {
  console.log(`Serving Next export at http://127.0.0.1:${port.toString()}`)
})
