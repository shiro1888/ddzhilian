import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Search } from 'lucide-react'

export type CommandPaletteItem = {
  id: string
  label: string
  description: string
  icon?: ReactNode
  action: () => void
}

type CommandPaletteProps = {
  open: boolean
  commands: CommandPaletteItem[]
  onClose: () => void
}

export function CommandPalette({
  open,
  commands,
  onClose,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!open) {
      return undefined
    }
    const frameId = window.requestAnimationFrame(() => inputRef.current?.focus())
    return () => window.cancelAnimationFrame(frameId)
  }, [open])

  const filteredCommands = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) {
      return commands
    }

    return commands.filter((command) =>
      `${command.label} ${command.description}`.toLowerCase().includes(normalizedQuery),
    )
  }, [commands, query])

  if (!open) {
    return null
  }

  const closePalette = () => {
    setQuery('')
    onClose()
  }

  const runCommand = (command: CommandPaletteItem) => {
    closePalette()
    command.action()
  }

  return (
    <div className="dd-command-palette" role="dialog" aria-modal="true" aria-label="命令面板">
      <button
        type="button"
        className="dd-command-palette__scrim"
        aria-label="关闭命令面板"
        onClick={closePalette}
      />
      <section
        className="dd-command-palette__panel"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            closePalette()
            return
          }

          if (event.key === 'Enter' && filteredCommands[0]) {
            event.preventDefault()
            runCommand(filteredCommands[0])
          }
        }}
      >
        <label className="dd-command-palette__search">
          <Search size={16} strokeWidth={2} aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            placeholder="搜索命令或直接输入快捷操作"
            onChange={(event) => setQuery(event.target.value)}
          />
          <kbd>Esc</kbd>
        </label>
        <div className="dd-command-palette__list" role="listbox">
          {filteredCommands.length > 0 ? (
            filteredCommands.map((command) => (
              <button
                key={command.id}
                type="button"
                className="dd-command-palette__item"
                onClick={() => runCommand(command)}
              >
                <span className="dd-command-palette__icon" aria-hidden="true">
                  {command.icon}
                </span>
                <span>
                  <strong>{command.label}</strong>
                  <small>{command.description}</small>
                </span>
              </button>
            ))
          ) : (
            <div className="dd-command-palette__empty">
              没有匹配的命令
            </div>
          )}
        </div>
        <footer className="dd-command-palette__footer">
          <span><kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>K</kbd> 打开</span>
          <span><kbd>Enter</kbd> 执行第一项</span>
        </footer>
      </section>
    </div>
  )
}
