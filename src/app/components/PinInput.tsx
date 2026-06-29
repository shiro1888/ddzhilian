type PinInputProps = {
  value: string
  placeholder: string
  onChange: (value: string) => void
}

export function PinInput({ value, placeholder, onChange }: PinInputProps) {
  return (
    <label className="dd-snaplink__trust-dialog-pin">
      <span>
        <strong>PIN / 短码校验</strong>
        <small>可输入对方页面显示的短码；留空则仅做本机确认。</small>
      </span>
      <input
        value={value}
        inputMode="text"
        autoCapitalize="characters"
        placeholder={placeholder}
        onChange={(event) => onChange(event.currentTarget.value.toUpperCase())}
      />
    </label>
  )
}
