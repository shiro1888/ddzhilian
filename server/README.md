# ddzhilian Signaling Server

This backend owns the first-phase architecture for:

- web device pairing
- text messaging signaling
- file transfer signaling
- multi-device auto-connect for the same account
- LAN discovery using a same-network heuristic

The actual chat text and file bytes should move through WebRTC data channels between browsers. This server only coordinates who can see whom, how pairing happens, and where signaling messages go.

## Responsibilities

- Device presence and reconnect identity
- Temporary short codes and pair tokens
- Same-account auto-connect decisions
- LAN peer discovery metadata
- LAN auto-link for discoverable devices
- WebRTC signaling relay
- Session lifecycle state
- Supabase Auth account sessions for the image-generation route
- Per-account image-generation history plus daily free and paid image quota counters stored in `user_profiles`
- Account-based admin login and admin role management backed by Supabase Auth plus `admin_roles`

## LAN Discovery In This MVP

Browsers cannot reliably scan a LAN by themselves, so this backend groups devices by network context:

- private IPv4 clients are grouped by `/24` subnet
- otherwise the server falls back to the observed public IP

That makes LAN discovery accurate when the signaling server is reachable inside the LAN, and heuristic when multiple devices arrive through the same public gateway.

In the current backend behavior:

- devices with the same `accountId` and `autoConnect: true` will auto-create sessions
- devices in the same detected LAN with `discoverable: true` will also auto-create sessions

When the server is deployed behind `nginx`, it reads `X-Forwarded-For` to recover the real client address before doing LAN grouping.

## Local Run

```bash
cd server
npm install
npm run dev
```

Copy `.env.example` to `.env` if you want custom ports or TURN credentials.

## Environment

- `PORT`: HTTP and WebSocket port, default `8787`
- `HOST`: bind host, default `0.0.0.0`
- `PUBLIC_WS_URL`: public socket URL returned to clients
- `ALLOWED_ORIGINS`: optional comma-separated list of allowed browser origins for cross-origin HTTP access
- `ENABLE_DEBUG_STATE_API`: optional flag to expose `/api/debug/state`, default `false`
- `DEBUG_STATE_API_TOKEN`: bearer token required when `/api/debug/state` is enabled
- `PING_INTERVAL_MS`: websocket keepalive interval
- `SESSION_IDLE_MS`: stale session cleanup threshold
- `ROOM_EXIT_GRACE_MS`: how long a disconnected browser keeps its room membership, default 30 minutes
- `HISTORY_RETENTION_MS`: file history retention window, default 6 hours, capped at 24 hours
- `HISTORY_TEXT_RETENTION_MS`: text history retention window, default 24 hours, capped at 24 hours
- `HISTORY_PAGE_SIZE`: history text lazy-load page size, default `50`
- `TURN_URL`: optional single TURN server URL
- `TURN_URLS`: optional comma-separated TURN server URLs
- `TURN_USERNAME`: optional TURN username
- `TURN_CREDENTIAL`: optional TURN credential
- `HISTORY_MAX_BYTES`: per-room history file storage cap, default 10 GiB
- `SUPABASE_URL`: optional Supabase project URL for history metadata
- `SUPABASE_SERVICE_ROLE_KEY`: optional service-role key used only by the backend
- `SUPABASE_ANON_KEY`: optional anon/publishable key used for Supabase Auth sign-up, login, session refresh, and confirmation-email delivery; when omitted the backend falls back to the service-role key
- `SUPABASE_HISTORY_FILES_TABLE`: optional file-metadata table name, default `history_files`
- `SUPABASE_HISTORY_TEXTS_TABLE`: optional text-history table name, default `history_texts`
- `SUPABASE_USER_PROFILES_TABLE`: optional user profile table name, default `user_profiles`
- `SUPABASE_IMAGE_GENERATIONS_TABLE`: optional generated-image history table name, default `image_generations`
- `SUPABASE_ADMIN_ROLES_TABLE`: optional admin role table name, default `admin_roles`
- `SUPABASE_AUTH_EMAIL_REDIRECT_URL`: Supabase Auth email callback URL. Production should set this explicitly to `https://ddzhilian.com/auth/confirm`; leave it empty only when you want the backend to derive `/auth/confirm` from `PUBLIC_WS_URL`.
- `RESEND_API_KEY`: optional backend-only Resend API key for the local test-email script; replace the placeholder `re_xxxxxxxxx` in `server/.env` with your real key before running it
- `RESEND_TEST_FROM`: sender used by the Resend API smoke test, default `onboarding@resend.dev`
- `RESEND_TEST_TO`: recipient used by the Resend API smoke test
- `RESEND_TEST_SUBJECT`: subject used by the Resend API smoke test, default `确认你的 ddzhilian 账号`
- `RESEND_TEST_ACTION_URL`: confirmation button URL used when rendering the local Resend HTML template
- `RESEND_TEST_BRAND_NAME`: brand text used when rendering the local Resend HTML template, default `ddzhilian`
- `RESEND_TEST_SUPPORT_EMAIL`: support email shown in the local Resend HTML template
- `RESEND_TEST_TEMPLATE_PATH`: template path relative to `server/`, default `email-templates/resend-email-confirmation.html`
- `ADMIN_SUPER_EMAILS`: comma-separated Supabase account emails that act as super administrators; super admins can add/remove normal admins and manage API keys
- `AI_PROVIDER`: active AI provider, `cloudflare` or `openrouter`; when omitted, OpenRouter is used if `OPENROUTER_API_KEY` is set, otherwise Cloudflare is used
- `AI_WEB_SEARCH_ENABLED`: set to `true` to allow `/api/ai/chat` requests to use the configured SearXNG instance when the client asks for web search
- `SEARXNG_BASE_URL`: backend-only SearXNG base URL, default `http://127.0.0.1:8080`; the server calls `${SEARXNG_BASE_URL}/search?format=json`
- `SEARXNG_MAX_RESULTS`: maximum search results injected into the AI prompt, default `5`, allowed range `1` to `10`
- `SEARXNG_TIMEOUT_MS`: SearXNG request timeout, default `8000`, allowed range `1000` to `30000`
- `SEARXNG_SAFE_SEARCH`: SearXNG safe-search level, `0`, `1`, or `2`, default `1`
- `SEARXNG_LANGUAGE`: optional SearXNG language code; leave empty to use the instance default
- `SEARXNG_CATEGORIES`: optional SearXNG category list, default `general`
- `CLOUDFLARE_AI_ACCOUNT_ID`: Cloudflare account ID for Workers AI REST API
- `CLOUDFLARE_AI_API_TOKEN`: Cloudflare API token with Workers AI execution access
- `CLOUDFLARE_AI_MODEL`: default Workers AI model name, default `@cf/google/gemma-4-26b-a4b-it`
- `CLOUDFLARE_AI_MODELS`: comma-separated model allowlist for the UI and API, each item can be `modelId|Label`; default includes `@cf/google/gemma-4-26b-a4b-it` and `@cf/openai/gpt-oss-120b`
- `CLOUDFLARE_AI_MAX_PROMPT_CHARS`: maximum prompt size accepted by `/api/ai/chat`, default `8000`
- `CLOUDFLARE_AI_MAX_OUTPUT_TOKENS`: maximum model output tokens per request, default `1000`
- `CLOUDFLARE_AI_FREE_ONLY`: when not set to `false`, the server stops AI requests at the local free-tier budget
- `CLOUDFLARE_AI_DAILY_NEURON_BUDGET`: local daily Workers AI budget, default `10000`
- `CLOUDFLARE_AI_INPUT_NEURONS_PER_M_TOKENS`: input pricing estimate for local budget checks, default `4625`
- `CLOUDFLARE_AI_OUTPUT_NEURONS_PER_M_TOKENS`: output pricing estimate for local budget checks, default `30475`
- `OPENROUTER_API_KEY`: OpenRouter API key used only by the backend
- `OPENROUTER_API_KEY_FILE`: optional file path used by the model sync script when the key is not in the environment
- `OPENROUTER_MODEL`: default OpenRouter model ID
- `OPENROUTER_MODELS`: comma-separated OpenRouter model allowlist for the UI and API, each item can be `modelId|Label`, for example `openai/gpt-4o-mini|GPT-4o mini,anthropic/claude-3.5-haiku|Claude 3.5 Haiku`
- `OPENROUTER_PREFERRED_MODELS`: optional comma-separated preference order for the sync script when choosing `OPENROUTER_MODEL`
- `OPENROUTER_SYNC_SET_PROVIDER`: set to `true` if the sync script should switch `AI_PROVIDER` to `openrouter` even when no API key is present
- `OPENROUTER_BASE_URL`: OpenRouter API base URL, default `https://openrouter.ai/api/v1`
- `OPENROUTER_REASONING_EFFORT`: optional reasoning effort for OpenAI-compatible requests, allowed values `low`, `medium`, `high`
- `OPENROUTER_SITE_URL`: optional site attribution URL sent as `HTTP-Referer`
- `OPENROUTER_SITE_NAME`: optional site attribution title sent as `X-OpenRouter-Title`, default `ddzhilian`
- `OPENROUTER_MAX_PROMPT_CHARS`: maximum prompt size accepted by `/api/ai/chat`, default `8000`
- `OPENROUTER_MAX_OUTPUT_TOKENS`: maximum model output tokens per request, default `1000`
- `CODEX_IMAGE_BASE_URL`: Codex reverse-proxy OpenAI-compatible base URL for `/api/ai/image`, default `https://cpa.shiro1888.com/v1`; the backend uses `/images/generations` for text-only requests and `/images/edits` when images are uploaded
- `CODEX_IMAGE_API_KEY`: optional backend-only bearer token for the Codex image reverse proxy; falls back to `OPENAI_IMAGE_API_KEY` or `OPENAI_API_KEY`
- `CODEX_IMAGE_MODEL`: image model used by `/api/ai/image`, default `gpt-image-2`
- `CODEX_IMAGE_SIZE`: generated image size sent to the reverse proxy, default `2000x2000`; the server accepts `auto` or explicit `WIDTHxHEIGHT` sizes, rejects any dimension above `2000`, and rounds explicit dimensions to the nearest multiple of 16 before calling the upstream image API.
- `CODEX_IMAGE_QUALITY`: optional image quality parameter, default `auto`
- `CODEX_IMAGE_MAX_PROMPT_CHARS`: maximum prompt size accepted by `/api/ai/image`, default `4000`
- `CODEX_IMAGE_PARALLEL_REQUESTS`: number of concurrent upstream image requests per app job, default `2`, allowed range `1` to `4`; the first successful response wins and the remaining local fetches are aborted. Values above `1` reduce long 524 wait chains but can increase upstream request/billing pressure.
- `CODEX_IMAGE_DAILY_FREE_QUOTA`: per-account free generated-image quota per refresh period, default `3`
- `CODEX_IMAGE_QUOTA_RESET_HOUR`: quota refresh hour in the configured quota timezone, default `4`
- `CODEX_IMAGE_QUOTA_TIMEZONE_OFFSET_MINUTES`: quota timezone offset from UTC in minutes, default `480` for UTC+8

## History Cleanup

History files are stored under `server/data/history/files/<roomId>/...`.
Generated images are stored under `server/data/image-assets/<userId>/<generationId>/...` and returned to the browser as authenticated `/api/ai/image/assets/...` image URLs instead of embedding base64 payloads in JSON responses.
Image quota usage is stored on `user_profiles`: `image_quota_used` and `image_quota_period_started_at` track the daily free quota window, while `image_paid_quota_remaining` and `image_paid_quota_used` track non-expiring paid image balance. Image jobs create rows in `image_quota_reservations` before calling the upstream provider, confirm the reservation after image/history persistence succeeds, and release it on failure. This keeps quota admission shared across multiple backend processes.
Admin access uses Supabase account login instead of a shared admin password. Super admins come from `ADMIN_SUPER_EMAILS`; normal admins are rows in `admin_roles`. API key and provider configuration endpoints require a super admin session, and non-super admin state responses do not include raw API key values.

- When Supabase is configured, text history and file metadata are persisted in Supabase.
- When Supabase is not configured, metadata falls back to `server/data/history/index.json`.
- SQL for the metadata and account image-history tables lives in `../supabase/schema.sql` and `../supabase/migrations`.

Public rooms do not have a separate cleanup policy. They use the same file-history rules as every other room:

- `HISTORY_RETENTION_MS` removes file records older than the configured retention window. The default is 6 hours, and the server caps it at 24 hours.
- `HISTORY_TEXT_RETENTION_MS` removes text records older than the configured retention window. The default and maximum are 24 hours.
- `HISTORY_MAX_BYTES` caps historical file storage per room. The default is 10 GiB.
- `HISTORY_PAGE_SIZE` controls how many historical texts are returned per request. The default is 50.
- When a room exceeds the byte cap, cleanup removes the oldest files first until the room is under the limit.
- File cleanup deletes both the metadata entry and the stored file on disk.
- Cleanup runs on server startup, history listing, history writes, file save/upload paths, and the periodic maintenance loop.
- Text cleanup deletes the metadata entry; message recall still deletes the target text immediately.

## Endpoints

- `GET /health`
- `GET /api/debug/state` (disabled by default; requires bearer token when enabled)
- `POST /api/auth/register` (creates a Supabase Auth user, sends a confirmation email, and does not create a session until the email is confirmed)
- `GET /api/auth/confirm` (verifies Supabase email `token_hash`, writes the account session cookie when Supabase returns a session, then redirects to `/image` by default)
- `POST /api/auth/login` (requires a confirmed Supabase Auth email and returns an HttpOnly account session cookie)
- `POST /api/auth/logout` (clears the account session cookie)
- `GET /api/auth/session` (returns the current account session state)
- `POST /api/admin/login` (requires Supabase account email/password and an admin role; returns an HttpOnly admin session cookie)
- `POST /api/admin/logout` (clears the admin session cookie)
- `GET /api/admin/session` (returns the current admin session, dashboard state, and role-aware configuration)
- `GET /api/admin/state` (requires an admin session)
- `POST /api/admin/ai-config` (requires a super admin session)
- `POST /api/admin/users/quota` (requires an admin session)
- `POST /api/admin/roles` (requires a super admin session; body `{ "email": "admin@example.com" }`)
- `DELETE /api/admin/roles/:userId` (requires a super admin session)
- `GET /api/ai/quota` (requires the device history bearer token; returns active AI provider status and model options)
- `POST /api/ai/chat` (requires the device history bearer token; proxies prompts to the configured AI provider, and can prepend SearXNG search results when `webSearch: true` is requested and `AI_WEB_SEARCH_ENABLED=true`)
- `GET /api/ai/image/quota` (requires the account session cookie; returns the current account's free, paid, and total image quota)
- `POST /api/ai/image` (requires the account session cookie; accepts JSON text-to-image requests or multipart image-edit requests with up to 8 `image[]` files; creates an async image-generation job and returns a `jobId`)
- `GET /api/ai/image/jobs/:jobId` (requires the account session cookie; polls the job until it returns the generated image or an error)
- `GET /api/ai/image/history` (requires the account session cookie; returns the account's generated-image history)
- `GET /api/ai/image/assets/:generationId/:index.png` (requires the account session cookie; streams the generated image file owned by the current account)
- `WS /ws`

## Resend API Smoke Test

The Resend API code is available as a backend-only smoke test:

```bash
cd server
npm run email:resend-test
```

Before running it, copy `.env.example` to `.env` and replace `RESEND_API_KEY=re_xxxxxxxxx` with your real Resend API key. The script renders `email-templates/resend-email-confirmation.html` with `RESEND_TEST_*` values from `server/.env`, then sends the rendered HTML through Resend.

Supabase Auth confirmation emails should still be configured through Supabase custom SMTP settings. Use the Resend API script only to verify that your Resend key can send mail, unless the project later replaces Supabase Auth's built-in confirmation flow.

## Primary Client Events

- `hello`
- `update-settings`
- `pair-by-short-code`
- `pair-by-token`
- `create-public-room`
- `request-connect`
- `signal`
- `session-state`
- `request-snapshot`

## Primary Server Events

- `welcome`
- `directory-snapshot`
- `session-created`
- `signal`
- `peer-state`
- `error`

## Frontend Handshake

1. Open `ws://.../ws`
2. Send `hello`
3. Persist returned `self.deviceId`
4. Render `peers`, `lanPeers`, and `accountPeers`
5. When `session-created` arrives and `initiator` is true, create the WebRTC offer
6. Relay SDP and ICE through `signal`
7. Move text and file chunks through the data channel
8. Report `connected`, `failed`, and `closed` through `session-state`
