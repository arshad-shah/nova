import { Checkbox, Text } from '@/primitives'

/**
 * A boolean row in the connection form.
 *
 * A Checkbox rather than a Switch, deliberately. A switch says "this takes
 * effect now"; every boolean in this form writes to a local draft that is only
 * persisted when Save is pressed — and Cancel discards it. A checkbox says
 * "this is part of the form", which is the truth here. Settings keep their
 * Switches, because those really do apply the moment you flip them.
 *
 * The `<label>` is what makes the text clickable, and natively: the browser
 * forwards the click to the input exactly once. The alternative — an onClick on
 * the row — has to be hand-reconciled against the input's own onChange, and
 * only works if the two happen to fire in the right order.
 */
export function ToggleRow({ label, checked, onChange }: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    // `self-start` so the hit area is the control and its label, not the whole
    // width of the form column.
    <label className="flex min-h-8 cursor-pointer items-center gap-2 self-start">
      <Checkbox checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <Text size="sm" color="secondary">{label}</Text>
    </label>
  )
}
