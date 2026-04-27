import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const defaultBaseUrl = 'https://openrouter.ai/api/v1'
const defaultEnvPath = resolve(process.cwd(), '.env')
const defaultPreferredModels = [
  'inclusionai/ling-2.6-flash:free',
  'inclusionai/ling-2.6-1t:free',
  'openrouter/free',
]
const nonChatModelPattern = /\b(ocr|lyria|audio|speech|tts|clip|embedding|moderation)\b/i

function readArgumentValue(name) {
  const index = process.argv.indexOf(name)
  if (index < 0) {
    return undefined
  }

  const value = process.argv[index + 1]
  return value && !value.startsWith('--') ? value : ''
}

function hasFlag(name) {
  return process.argv.includes(name)
}

function splitList(value) {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function parsePrice(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : Number.NaN
}

function sanitizeEnvLabel(value) {
  return value.replace(/[|,\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function delay(ms) {
  return new Promise((resolveDelay) => {
    setTimeout(resolveDelay, ms)
  })
}

function labelFromModel(model) {
  const displayName = typeof model.name === 'string' ? model.name.trim() : ''
  if (displayName) {
    return sanitizeEnvLabel(displayName)
  }

  const id = typeof model.id === 'string' ? model.id : ''
  return sanitizeEnvLabel(id.split('/').pop()?.replace(/:free$/i, '') || id)
}

function formatModelsEnvValue(models) {
  return models
    .map((model) => `${model.id}|${labelFromModel(model)}`)
    .join(',')
}

function chooseDefaultModel(models, existingDefault, envValues) {
  const modelIds = new Set(models.map((model) => model.id))
  const preferredModels = splitList(envValues.OPENROUTER_PREFERRED_MODELS)

  for (const modelId of [existingDefault, ...preferredModels, ...defaultPreferredModels]) {
    if (modelId && modelIds.has(modelId)) {
      return modelId
    }
  }

  return models[0]?.id ?? ''
}

async function readOptionalFile(path) {
  if (!path) {
    return ''
  }

  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return ''
    }

    throw error
  }
}

function parseEnvValues(value) {
  const values = {}
  for (const line of value.split(/\r?\n/)) {
    const trimmedLine = line.trim()
    if (!trimmedLine || trimmedLine.startsWith('#')) {
      continue
    }

    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line)
    if (!match) {
      continue
    }

    values[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '')
  }

  return values
}

async function readApiKey(envValues) {
  if (envValues.OPENROUTER_API_KEY?.trim()) {
    return envValues.OPENROUTER_API_KEY.trim()
  }

  const keyFile = readArgumentValue('--key-file') || envValues.OPENROUTER_API_KEY_FILE
  const key = await readOptionalFile(keyFile ? resolve(keyFile) : '')
  return key.trim()
}

async function fetchOpenRouterModels(envValues) {
  const baseUrl = (envValues.OPENROUTER_BASE_URL?.trim() || defaultBaseUrl).replace(/\/$/, '')
  const headers = {
    accept: 'application/json',
  }
  const apiKey = await readApiKey(envValues)
  if (apiKey) {
    headers.authorization = `Bearer ${apiKey}`
  }

  let lastError
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/models`, { headers })
      const payload = await response.json().catch(() => null)

      if (!response.ok || !payload || !Array.isArray(payload.data)) {
        throw new Error(`OpenRouter models request failed with status ${response.status}`)
      }

      return payload.data
    } catch (error) {
      lastError = error
      if (attempt < 3) {
        await delay(attempt * 1500)
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('OpenRouter models request failed.')
}

function isLikelyTextChatModel(model) {
  const architecture = model?.architecture && typeof model.architecture === 'object'
    ? model.architecture
    : {}
  const outputModalities = Array.isArray(architecture.output_modalities)
    ? architecture.output_modalities
    : []
  const identity = `${model.id ?? ''} ${model.name ?? ''}`

  return (
    outputModalities.includes('text') &&
    outputModalities.every((modality) => modality === 'text') &&
    !nonChatModelPattern.test(identity)
  )
}

function pickFreeModels(models) {
  return models
    .filter((model) => {
      if (!model || typeof model !== 'object') {
        return false
      }

      const pricing = model.pricing
      if (!pricing || typeof pricing !== 'object') {
        return false
      }

      return (
        typeof model.id === 'string' &&
        model.id.trim().length > 0 &&
        parsePrice(pricing.prompt) === 0 &&
        parsePrice(pricing.completion) === 0 &&
        isLikelyTextChatModel(model)
      )
    })
    .map((model) => ({
      id: model.id.trim(),
      name: typeof model.name === 'string' ? model.name.trim() : '',
    }))
    .sort((left, right) => left.id.localeCompare(right.id))
}

function upsertEnvValues(value, updates) {
  const lines = value ? value.split(/\r?\n/) : []
  const seenKeys = new Set()
  const nextLines = lines.map((line) => {
    const match = /^([A-Z0-9_]+)=/.exec(line)
    if (!match || !(match[1] in updates)) {
      return line
    }

    seenKeys.add(match[1])
    return `${match[1]}=${updates[match[1]]}`
  })

  for (const [key, nextValue] of Object.entries(updates)) {
    if (!seenKeys.has(key)) {
      nextLines.push(`${key}=${nextValue}`)
    }
  }

  return `${nextLines.filter((line, index) => line || index < nextLines.length - 1).join('\n')}\n`
}

async function pathExists(path) {
  try {
    await stat(path)
    return true
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return false
    }

    throw error
  }
}

async function writeEnvFile(path, updates) {
  const existingValue = await readOptionalFile(path)
  if (await pathExists(path)) {
    const backupPath = `${path}.bak.${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`
    await copyFile(path, backupPath)
    console.log(`Backed up ${path} to ${backupPath}`)
  }

  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, upsertEnvValues(existingValue, updates), 'utf8')
  console.log(`Updated ${path}`)
}

const envPathArg = readArgumentValue('--write-env')
const envPath = envPathArg !== undefined
  ? resolve(envPathArg || defaultEnvPath)
  : undefined
const targetEnvValues = envPath ? parseEnvValues(await readOptionalFile(envPath)) : {}
const runtimeEnv = {
  ...targetEnvValues,
  ...process.env,
}

const models = pickFreeModels(await fetchOpenRouterModels(runtimeEnv))
if (models.length === 0) {
  throw new Error('No free OpenRouter models found.')
}

const envModels = formatModelsEnvValue(models)
const existingDefault = runtimeEnv.OPENROUTER_MODEL?.trim()
const defaultModel = chooseDefaultModel(models, existingDefault, runtimeEnv)
const updates = {
  OPENROUTER_MODEL: defaultModel,
  OPENROUTER_MODELS: envModels,
}
if (
  runtimeEnv.AI_PROVIDER === 'openrouter' ||
  runtimeEnv.OPENROUTER_API_KEY?.trim() ||
  runtimeEnv.OPENROUTER_SYNC_SET_PROVIDER === 'true'
) {
  updates.AI_PROVIDER = 'openrouter'
}

if (envPathArg !== undefined) {
  await writeEnvFile(envPath, updates)
} else if (!hasFlag('--quiet')) {
  console.log(`Found ${models.length.toString()} free OpenRouter models.`)
  console.log(`OPENROUTER_MODEL=${defaultModel}`)
  console.log(`OPENROUTER_MODELS=${envModels}`)
}
