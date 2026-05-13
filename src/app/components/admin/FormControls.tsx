import { Field } from '@base-ui/react/field'
import { Switch } from '@base-ui/react/switch'
import type { ReactNode } from 'react'

type AdminFieldProps = {
  label: string
  wide?: boolean
  children: ReactNode
}

export function AdminConfigField({ label, wide = false, children }: AdminFieldProps) {
  return (
    <Field.Root className={`dd-admin-config-field${wide ? ' dd-admin-config-field--wide' : ''}`}>
      <Field.Label className="dd-admin-config-label">
        {label}
      </Field.Label>
      {children}
    </Field.Root>
  )
}

export function AdminBaseSwitch({
  checked,
  label,
  onCheckedChange,
}: {
  checked: boolean
  label: string
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <Switch.Root
      aria-label={label}
      checked={checked}
      className="dd-admin-base-switch"
      onCheckedChange={onCheckedChange}
    >
      <Switch.Thumb className="dd-admin-base-switch__thumb" />
    </Switch.Root>
  )
}

