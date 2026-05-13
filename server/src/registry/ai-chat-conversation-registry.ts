import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';

export type AiChatMessageRole = 'user' | 'assistant';
export type AiChatMessageStatus = 'streaming' | 'complete' | 'failed' | 'stopped';

export interface AiChatConversationMessage {
  id: string;
  role: AiChatMessageRole;
  content: string;
  createdAt: string;
  status?: AiChatMessageStatus;
  model?: string;
  attachments?: AiChatMessageAttachmentSummary[];
}

export interface AiChatMessageAttachmentSummary {
  id: string;
  kind: 'image' | 'text';
  name: string;
  size: number;
  mimeType?: string;
  textPreview?: string;
}

export interface AiChatConversationRecord {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  pinned?: boolean;
  archived?: boolean;
  parentConversationId?: string;
  messages: AiChatConversationMessage[];
}

type PersistedAiChatConversations = {
  version: 1;
  scopes: Record<string, AiChatConversationRecord[]>;
};

const MAX_CONVERSATIONS_PER_SCOPE = 50;
const MAX_MESSAGES_PER_CONVERSATION = 120;
const MAX_MESSAGE_CHARS = 24_000;
const MAX_TITLE_CHARS = 80;
const MAX_ATTACHMENT_SUMMARIES_PER_MESSAGE = 8;
const MAX_ATTACHMENT_NAME_CHARS = 160;
const MAX_ATTACHMENT_PREVIEW_CHARS = 240;

function normalizeText(value: unknown, maxChars: number) {
  return typeof value === 'string' ? value.trim().slice(0, maxChars) : '';
}

function normalizeTimestamp(value: unknown, fallback: string) {
  if (typeof value !== 'string') {
    return fallback;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function normalizeAttachmentSummary(value: unknown): AiChatMessageAttachmentSummary | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Partial<AiChatMessageAttachmentSummary>;
  const id = normalizeText(record.id, 120);
  const name = normalizeText(record.name, MAX_ATTACHMENT_NAME_CHARS);
  const size = typeof record.size === 'number' && Number.isFinite(record.size)
    ? Math.max(0, Math.round(record.size))
    : 0;

  if (!id || !name || (record.kind !== 'image' && record.kind !== 'text')) {
    return null;
  }

  return {
    id,
    kind: record.kind,
    name,
    size,
    ...(typeof record.mimeType === 'string' && record.mimeType.trim()
      ? { mimeType: record.mimeType.trim().slice(0, 120) }
      : {}),
    ...(typeof record.textPreview === 'string' && record.textPreview.trim()
      ? { textPreview: record.textPreview.trim().slice(0, MAX_ATTACHMENT_PREVIEW_CHARS) }
      : {}),
  };
}

function normalizeMessage(value: unknown): AiChatConversationMessage | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Partial<AiChatConversationMessage>;
  const id = normalizeText(record.id, 120);
  const content = typeof record.content === 'string'
    ? record.content.slice(0, MAX_MESSAGE_CHARS)
    : '';
  const createdAt = normalizeTimestamp(record.createdAt, new Date().toISOString());

  if (!id || (record.role !== 'user' && record.role !== 'assistant')) {
    return null;
  }

  return {
    id,
    role: record.role,
    content,
    createdAt,
    ...(Array.isArray(record.attachments)
      ? {
          attachments: record.attachments
            .map(normalizeAttachmentSummary)
            .filter((attachment): attachment is AiChatMessageAttachmentSummary => Boolean(attachment))
            .slice(0, MAX_ATTACHMENT_SUMMARIES_PER_MESSAGE),
        }
      : {}),
    ...(record.status && ['streaming', 'complete', 'failed', 'stopped'].includes(record.status)
      ? { status: record.status }
      : {}),
    ...(typeof record.model === 'string' && record.model.trim()
      ? { model: record.model.trim().slice(0, 120) }
      : {}),
  };
}

function normalizeConversation(value: unknown): AiChatConversationRecord | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Partial<AiChatConversationRecord>;
  const id = normalizeText(record.id, 120);
  const now = new Date().toISOString();
  const messages = Array.isArray(record.messages)
    ? record.messages.map(normalizeMessage).filter((message): message is AiChatConversationMessage => Boolean(message))
    : [];

  if (!id) {
    return null;
  }

  return {
    id,
    title: normalizeText(record.title, MAX_TITLE_CHARS) || '新对话',
    createdAt: normalizeTimestamp(record.createdAt, now),
    updatedAt: normalizeTimestamp(record.updatedAt, now),
    ...(record.pinned === true ? { pinned: true } : {}),
    ...(record.archived === true ? { archived: true } : {}),
    ...(typeof record.parentConversationId === 'string' && record.parentConversationId.trim()
      ? { parentConversationId: record.parentConversationId.trim().slice(0, 120) }
      : {}),
    messages: messages.slice(-MAX_MESSAGES_PER_CONVERSATION),
  };
}

function sanitizeScopeKey(value: string) {
  return value.replace(/[^a-zA-Z0-9:_-]/g, '_').slice(0, 120);
}

export class AiChatConversationRegistry {
  private data: PersistedAiChatConversations = {
    version: 1,
    scopes: {},
  };

  constructor(private readonly storagePath: string) {}

  async load() {
    try {
      const raw = await fs.readFile(this.storagePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<PersistedAiChatConversations>;
      const scopes = parsed.scopes && typeof parsed.scopes === 'object'
        ? parsed.scopes
        : {};

      this.data = {
        version: 1,
        scopes: Object.fromEntries(
          Object.entries(scopes).map(([scope, conversations]) => [
            sanitizeScopeKey(scope),
            Array.isArray(conversations)
              ? conversations
                  .map(normalizeConversation)
                  .filter((conversation): conversation is AiChatConversationRecord => Boolean(conversation))
                  .slice(0, MAX_CONVERSATIONS_PER_SCOPE)
              : [],
          ]),
        ),
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error('AI chat conversations load failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  list(scopeKey: string) {
    return [...(this.data.scopes[sanitizeScopeKey(scopeKey)] ?? [])];
  }

  async replace(scopeKey: string, conversations: unknown[]) {
    const sanitizedScope = sanitizeScopeKey(scopeKey);
    this.data.scopes[sanitizedScope] = conversations
      .map(normalizeConversation)
      .filter((conversation): conversation is AiChatConversationRecord => Boolean(conversation))
      .sort(compareConversations)
      .slice(0, MAX_CONVERSATIONS_PER_SCOPE);
    await this.persist();
    return this.list(sanitizedScope);
  }

  async delete(scopeKey: string, conversationId?: string) {
    const sanitizedScope = sanitizeScopeKey(scopeKey);
    if (!conversationId) {
      this.data.scopes[sanitizedScope] = [];
      await this.persist();
      return [];
    }

    this.data.scopes[sanitizedScope] = (this.data.scopes[sanitizedScope] ?? [])
      .filter((conversation) => conversation.id !== conversationId);
    await this.persist();
    return this.list(sanitizedScope);
  }

  private async persist() {
    await fs.mkdir(dirname(this.storagePath), { recursive: true });
    await fs.writeFile(this.storagePath, `${JSON.stringify(this.data, null, 2)}\n`, 'utf8');
  }
}

function compareConversations(left: AiChatConversationRecord, right: AiChatConversationRecord) {
  if (left.pinned !== right.pinned) {
    return left.pinned ? -1 : 1;
  }

  return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
}
