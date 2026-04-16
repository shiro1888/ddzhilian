import { createReadStream, createWriteStream } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import { constants, createBrotliCompress, createGzip } from 'node:zlib'

const distDir = fileURLToPath(new URL('../dist/', import.meta.url))
const minSize = 1024
const compressibleExtensions = new Set([
  '.css',
  '.html',
  '.js',
  '.json',
  '.mjs',
  '.svg',
  '.txt',
  '.xml',
])

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const filePath = join(directory, entry.name)

    if (entry.isDirectory()) {
      files.push(...await walk(filePath))
      continue
    }

    files.push(filePath)
  }

  return files
}

async function compressFile(filePath, suffix, createStream) {
  await pipeline(
    createReadStream(filePath),
    createStream(),
    createWriteStream(`${filePath}${suffix}`),
  )
}

const files = await walk(distDir)
let compressedCount = 0

for (const filePath of files) {
  if (filePath.endsWith('.gz') || filePath.endsWith('.br')) {
    continue
  }

  if (!compressibleExtensions.has(extname(filePath))) {
    continue
  }

  const fileStat = await stat(filePath)
  if (fileStat.size < minSize) {
    continue
  }

  await Promise.all([
    compressFile(filePath, '.gz', () => createGzip({ level: 9 })),
    compressFile(filePath, '.br', () =>
      createBrotliCompress({
        params: {
          [constants.BROTLI_PARAM_QUALITY]: 11,
        },
      }),
    ),
  ])
  compressedCount += 1
}

console.log(`Precompressed ${compressedCount.toString()} dist files.`)
