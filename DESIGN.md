# ddzhilian Desktop Chat Design System

## 1. Visual Theme & Atmosphere

ddzhilian should feel like a desktop chat client in the same family as WeChat for Windows: quiet, efficient, familiar, and system-native. The interface is not trying to impress through gradients, floating cards, or dashboard spectacle. Its quality comes from restraint. Users should feel that sending a file, reading a long message, or checking a session is as lightweight as glancing at a desktop messenger.

The core visual idea is a three-zone workspace:

- a narrow utility rail for global navigation and identity
- a conversation and session column for fast scanning
- a large, calm message workspace for the active transfer or discussion

The emotional baseline is soft neutral gray rather than bright white. Surfaces are layered through small shifts in temperature and brightness, not through heavy shadows. The interface should look close to the host operating system, with the product personality showing up mainly in the outgoing bubble green, presence dots, and a few key action controls.

This style depends on disciplined color usage. Green is not a theme washed across the whole product; it is a state signal. It marks "my side", "online", "ready", or "send". Everything else should stay neutral and supportive so the content itself becomes the focal point.

**Key Characteristics**
- Desktop-first chat workspace with clear left-to-right functional zoning
- Soft gray shell with thin dividers and very light elevation
- Single accent family based on WeChat-style green
- High information density without visual pressure
- Mostly flat surfaces, minimal borders, almost no card language
- Sans-serif only, optimized for Chinese UI and utility reading
- Message bubbles as the main visual rhythm, not panels or widgets
- Calm, native interaction feel with short hover and state transitions

## 2. Color Palette & Roles

### Primary Accent
- **Bubble Green** (`#95ec69`): Main outgoing message bubble color. Friendly, light, instantly recognizable, and reserved for user-originated content.
- **Action Green** (`#07c160`): Stronger action state for online presence, send buttons, progress-positive moments, and focused status.
- **Green Deep** (`#06ad56`): Hover and pressed state for green actions.

### Neutral Surfaces
- **Window Gray** (`#f5f5f5`): Primary app background and message canvas base.
- **Sidebar Gray** (`#ededed`): Left navigation rail and secondary tool areas.
- **Panel Gray** (`#f7f7f7`): Conversation list, top bars, and input container backgrounds.
- **White Surface** (`#ffffff`): Incoming message bubbles, elevated inputs, menus, and lightweight floating layers.
- **Hover Gray** (`#e8e8e8`): Hover state for rows, list items, and utility buttons.
- **Active Row Gray** (`#dcdcdc`): Selected conversation row background.
- **Muted Fill** (`#f0f0f0`): Input backgrounds, file pills, and metadata chips.

### Borders & Separators
- **Divider Gray** (`#d9d9d9`): Standard vertical and horizontal separators.
- **Soft Divider** (`#e5e5e5`): Secondary separators inside lists and message utilities.
- **Input Stroke** (`#cfcfcf`): Input outlines and lightweight control containment.

### Text
- **Primary Text** (`#111111`): Main labels, message text, and important values.
- **Secondary Text** (`#666666`): Conversation preview text, helper labels, timestamps inside dense UI.
- **Tertiary Text** (`#999999`): Placeholder text, muted metadata, empty-state support copy.
- **Inverse Text** (`#ffffff`): Text placed on strong green actions or dark overlays.

### Semantic
- **Error Red** (`#fa5151`): Failed transfers, destructive badges, and unread counters where urgency is required.
- **Warning Orange** (`#fa9d3b`): Warning states such as unstable network or expiring sessions.
- **Link Blue** (`#576b95`): Optional inline link color for paths, codes, or help actions.

### Usage Principles
- Neutrals should cover at least 85% of the interface.
- Bubble Green should mostly appear in outgoing messages and a small number of CTA states.
- Avoid using both Bubble Green and Action Green in the same component unless there is a clear default-to-hover relationship.
- Keep error red rare so unread counts and failures remain easy to scan.
- Prefer background shifts over border-heavy state changes.

## 3. Typography Rules

### Font Family
- **Primary UI Font**: `PingFang SC`
- **Windows Fallback**: `Microsoft YaHei`
- **Cross-platform Fallback**: `Noto Sans SC`, `Segoe UI`, `system-ui`, `sans-serif`

ddzhilian should use one sans-serif system for nearly everything. This is a utility product, not an editorial or brand-heavy surface. Strong hierarchy should come from size, spacing, color, and placement rather than from mixing font personalities.

### Hierarchy

| Role | Size | Weight | Line Height | Usage |
|------|------|--------|-------------|-------|
| Window Title | 15px | 600 | 1.3 | Chat header titles, major panel titles |
| Section Title | 14px | 600 | 1.4 | Secondary panel headings, list group labels |
| Body Large | 15px | 400 | 1.6 | Message text, long text content |
| Body Standard | 14px | 400 | 1.5 | Conversation previews, form content |
| Body Small | 13px | 400 | 1.45 | Helper text, inline metadata |
| Caption | 12px | 400 | 1.4 | Timestamps, connection hints, empty states |
| Label | 11px | 500 | 1.3 | Badges, compact labels, status chips |

### Principles
- Default body size should stay at `14px` or `15px`; smaller text is only for metadata.
- Message content should use `15px` for readability in long chat sessions.
- Avoid bold paragraphs. Weight `600` is for headings or highlighted numeric data only.
- Use truncation aggressively in conversation rows but avoid truncating active chat titles.
- Numbers such as transfer size, progress, and time should align consistently and avoid decorative formatting.

## 4. Component Stylings

### App Shell
- Structure: `72px` icon rail + `280px` conversation column + flexible message workspace
- Background: Window Gray (`#f5f5f5`)
- Dividers: `1px solid #d9d9d9`
- Shadow: none inside the app; only the outer desktop window may use a soft OS-level shadow

The shell should read as one continuous desktop application, not three separate cards.

### Left Navigation Rail
- Width: `72px`
- Background: Sidebar Gray (`#ededed`)
- Layout: top-aligned brand/avatar, middle nav icons, bottom utility actions
- Icon size: `22px` to `24px`
- Active marker: green dot, green stroke, or slightly darker neutral tile
- Hover: background shift to Hover Gray (`#e8e8e8`)
- Badge style: small red circle anchored to icon corner

The rail should feel dense and stable. It is not a large navigation menu. Labels may appear on hover or in adjacent panels, but the base rail should stay icon-led.

### Conversation List Column
- Width: `280px`
- Background: Panel Gray (`#f7f7f7`)
- Top area: search box plus optional quick filters
- Row height: `72px` default, `64px` compact
- Selected row: Active Row Gray (`#dcdcdc`)
- Hover row: Hover Gray (`#e8e8e8`)
- Avatar: `40px` square or circle with `10px` radius if using square system avatars
- Primary line: `15px`, `600`
- Secondary preview: `13px`, `#666666`
- Time label: `12px`, `#999999`, right aligned
- Unread badge: red pill, minimum `18px` height

Each row should prioritize scan speed:

- name on the first line
- latest activity preview on the second line
- time and unread state aligned to the right

### Chat Header
- Height: `64px`
- Background: Panel Gray (`#f7f7f7`)
- Border-bottom: `1px solid #d9d9d9`
- Title: `15px`, `600`
- Subtitle or status: `12px`, `#999999`
- Right actions: icon buttons with `32px` hit area

This header should be visually quiet. It orients the user but never competes with the conversation itself.

### Message History Area
- Background: Window Gray (`#f5f5f5`)
- Horizontal padding: `24px`
- Vertical padding: `20px`
- Max readable line width for text bubbles: `62%` of content width on desktop
- Message stack gap: `8px`
- Group gap between distinct senders or time blocks: `16px`

Avoid card containers around the whole message pane. The conversation should live directly on the canvas with bubbles creating the rhythm.

### Time Divider
- Alignment: centered
- Text size: `12px`
- Color: `#999999`
- Spacing: `24px` above, `16px` below
- Optional background chip: Muted Fill (`#f0f0f0`) with `999px` radius and `6px 10px` padding

Time dividers should feel like small pauses in the stream, not heavy separators.

### Incoming Message Bubble
- Background: White Surface (`#ffffff`)
- Text: Primary Text (`#111111`)
- Radius: `8px`
- Padding: `10px 14px`
- Border: optional `1px solid #ececec` only if the background lacks contrast
- Shadow: none

Incoming content should feel lightweight and neutral. If tails are used, they should be very subtle and geometric.

### Outgoing Message Bubble
- Background: Bubble Green (`#95ec69`)
- Text: Primary Text (`#111111`)
- Radius: `8px`
- Padding: `10px 14px`
- Shadow: none
- Alignment: right

Outgoing bubbles are the primary brand moment inside the chat stream. They should stand out through color only, not through heavier shape treatment.

### Avatar Rules
- Standard size: `32px` in chat stream, `40px` in conversation list
- Shape: square with `8px` to `10px` radius or full circle depending on product icon system
- Gap to bubble: `8px`
- Consecutive messages from same sender may omit repeated avatar to reduce noise

### Composer / Input Area
- Height: `136px` to `168px` depending on tool rows
- Background: Panel Gray (`#f7f7f7`)
- Border-top: `1px solid #d9d9d9`
- Toolbar row: icon-led actions, `36px` hit area
- Text area: white or very light neutral field, no heavy border
- Placeholder: `#999999`
- Send button: green only when text or files are ready to send

The composer should feel integrated into the window, not boxed like a form card.

### File Transfer Bubble / Card
- Container background: White Surface for incoming, pale green-tinted neutral for outgoing
- Radius: `10px`
- Padding: `12px`
- File icon block: `40px`
- Title: `14px`, `600`
- Meta row: file size, transfer speed, source, expiry in `12px`
- Progress bar height: `4px`
- Progress fill: Action Green (`#07c160`)

For ddzhilian, transfer cards are functional first. Keep them short, easy to scan, and clearly distinct from plain text bubbles.

### Session Status Chips
- Height: `24px`
- Radius: `999px`
- Padding: `0 10px`
- Font: `11px`, `500`
- Neutral chip: Muted Fill (`#f0f0f0`) + Secondary Text (`#666666`)
- Success chip: pale green background + Action Green text
- Error chip: pale red background + Error Red text

### Search Box
- Height: `36px`
- Background: White Surface or Muted Fill
- Radius: `8px`
- Border: none by default
- Placeholder color: Tertiary Text (`#999999`)
- Focus: `1px` green or blue-tinted outline kept subtle and desktop-like

## 5. Layout Principles

### Primary Grid
- Global shell: `72 / 280 / auto`
- If an inspector or detail pane is needed, prefer overlay or temporary split instead of permanent four-column layout
- Chat area structure: header / scrollable history / composer

### Spacing System
- Base unit: `4px`
- Recommended scale: `4, 8, 12, 16, 20, 24, 32`
- Dense list internals: `8px`
- Chat bubble outer gaps: `8px`
- Panel paddings: `16px` to `24px`

### Whitespace Philosophy
- Keep the shell compact and information-rich.
- Spend whitespace inside the active message workspace, not around the chrome.
- Use empty space to separate message groups and reading blocks, not to decorate panels.

### Shape Language
- Default corner radius: `8px`
- Compact controls: `6px`
- Large pills and chips: `999px`
- Avoid mixing many radius styles in one screen

### Alignment Rules
- Conversation list content aligns to a consistent left text column after the avatar.
- Message bubbles align to sender edges, not to a centered content column.
- Header actions and composer tools should follow a strict icon grid.

## 6. Depth, States & Motion

### Elevation Model

| Level | Treatment | Use |
|------|-----------|-----|
| Level 0 | Flat surface, no shadow | Main shell, panels, chat canvas |
| Level 1 | Divider only | Headers, panel boundaries, rows |
| Level 2 | Background shift | Hover rows, hover icon buttons |
| Level 3 | Lightweight floating layer | Context menus, popovers, picker panels |

This design should not rely on shadow stacks for hierarchy. Depth comes from partition, alignment, and tone shifts.

### Interaction States
- Hover: background changes by one neutral step
- Active: slightly darker neutral fill or selected-row gray
- Focus: thin visible ring, preferably `#07c160` at low opacity
- Disabled: reduce contrast, never reduce legibility below a usable level

### Motion Rules
- Hover transitions: `120ms` to `180ms`
- Drawer or menu transitions: `180ms` to `220ms`
- Message arrival: very small fade and `translateY(4px)` settle
- Avoid springy or playful motion; the feel should stay efficient and desktop-native

## 7. Do's and Don'ts

### Do
- Use neutral gray panels as the visual foundation
- Keep green reserved for sender identity, positive state, and readiness
- Let conversation content dominate the active screen
- Make list scanning effortless through strong alignment and predictable row rhythm
- Use very thin separators instead of boxed card layouts
- Optimize for long-running usage sessions with low visual fatigue
- Keep iconography simple and system-like

### Don't
- Don't turn the app into a marketing dashboard with cards and spotlight panels
- Don't use gradients, glassmorphism, or colorful background effects in routine product UI
- Don't scatter accent green across navigation, headers, and panels at the same time
- Don't use oversized headings that waste desktop real estate
- Don't add deep shadows to bubbles or list rows
- Don't mix serif display typography into the core app shell
- Don't center content that users expect to scan left-to-right

## 8. Responsive Behavior

### Breakpoints

| Name | Width | Behavior |
|------|-------|----------|
| Desktop Large | `>= 1440px` | Standard three-zone shell with generous message width |
| Desktop Standard | `1200px - 1439px` | Default layout, conversation list at `280px` |
| Desktop Compact | `1024px - 1199px` | Reduce conversation list to `240px`, tighten paddings |
| Tablet / Narrow Window | `768px - 1023px` | Collapse left rail labels, allow conversation list hide/show |
| Mobile Fallback | `< 768px` | One-pane navigation pattern; list and chat should not be permanently side by side |

### Responsive Priorities
- Preserve message readability before preserving peripheral chrome.
- On narrow widths, shrink the conversation list first, not the bubble text size.
- Keep outgoing and incoming bubble distinction strong at every width.
- Maintain minimum tap targets of `36px` even in compact layouts.

## 9. ddzhilian-Specific Recommendations

Because ddzhilian is not only a chat client but also a device-to-device transfer tool, the WeChat-like shell should be adapted for operational clarity:

- File transfer states should appear inline in the chat stream, not hidden in a separate dashboard by default.
- Device presence, session code, and transfer progress should use compact chips and rows, not large hero modules.
- "Connect", "Send", "Receive", and "Sessions" can live in the left rail or list filters, but the active workspace should still look like one continuous chat environment.
- Long text, transfer cards, and connection notices should all respect the same bubble rhythm so the product feels coherent.

## 10. Suggested CSS Tokens

```css
:root {
  --cc-window: #f5f5f5;
  --cc-sidebar: #ededed;
  --cc-panel: #f7f7f7;
  --cc-surface: #ffffff;
  --cc-hover: #e8e8e8;
  --cc-active-row: #dcdcdc;
  --cc-divider: #d9d9d9;
  --cc-divider-soft: #e5e5e5;
  --cc-text: #111111;
  --cc-text-secondary: #666666;
  --cc-text-tertiary: #999999;
  --cc-bubble-out: #95ec69;
  --cc-green: #07c160;
  --cc-green-deep: #06ad56;
  --cc-danger: #fa5151;
  --cc-warning: #fa9d3b;
  --cc-link: #576b95;
  --cc-radius-sm: 6px;
  --cc-radius-md: 8px;
  --cc-radius-lg: 10px;
  --cc-shadow-float: 0 8px 24px rgba(0, 0, 0, 0.08);
}
```

This token set is intentionally small. The design should gain quality from consistency and restraint, not from a large theme matrix.
