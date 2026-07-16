import { useEffect, useRef, useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn, expect, userEvent } from 'storybook/test'
import { Checkbox } from './Checkbox'

const meta: Meta<typeof Checkbox> = {
  title: 'Primitives/Forms/Checkbox',
  component: Checkbox,
  argTypes: {
    disabled: { control: 'boolean' },
    defaultChecked: { control: 'boolean' },
  },
}
export default meta
type Story = StoryObj<typeof Checkbox>

export const Default: Story = {
  args: { 'aria-label': 'Toggle option', onChange: fn() },
  play: async ({ args, canvas }) => {
    const checkbox = canvas.getByRole('checkbox')
    await userEvent.click(checkbox)
    await expect(args.onChange).toHaveBeenCalledOnce()
  },
}

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      {(['sm', 'md', 'lg'] as const).map((size) => (
        <label key={size} className="flex items-center gap-2 text-sm text-text-primary cursor-pointer">
          <Checkbox size={size} defaultChecked aria-label={`size ${size}`} />
          {size}
        </label>
      ))}
    </div>
  ),
}

/** Indeterminate is a DOM property, not an attribute — it can only be set via a
 *  ref. It represents "some but not all children selected" and takes precedence
 *  over `checked`, so the dash shows even on a checked box. */
export const Indeterminate: Story = {
  render: () => {
    function Tri({ checked, label }: { checked: boolean; label: string }) {
      const ref = useRef<HTMLInputElement>(null)
      useEffect(() => {
        if (ref.current) ref.current.indeterminate = true
      }, [])
      return (
        <label className="flex items-center gap-2 text-sm text-text-primary cursor-pointer">
          <Checkbox ref={ref} defaultChecked={checked} aria-label={label} />
          {label}
        </label>
      )
    }
    return (
      <div className="flex flex-col gap-3">
        <Tri checked={false} label="Indeterminate" />
        <Tri checked label="Indeterminate wins over checked" />
      </div>
    )
  },
}

export const States: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      {[
        { label: 'Unchecked', defaultChecked: false },
        { label: 'Checked', defaultChecked: true },
        { label: 'Disabled', disabled: true },
        { label: 'Disabled + checked', defaultChecked: true, disabled: true },
      ].map(({ label, ...props }) => (
        <label key={label} className="flex items-center gap-2 text-sm text-text-primary cursor-pointer">
          <Checkbox {...props} />
          {label}
        </label>
      ))}
    </div>
  ),
}

/** The reason `indeterminate` exists: a parent that is neither all nor none.
 *  This is a composition, not a Checkbox feature — the primitive just needs to
 *  be able to show three states, and it can. */
export const SelectAllTree: Story = {
  render: () => {
    function Tree() {
      const CHILDREN = ['Product updates', 'Marketing emails', 'Security alerts']
      const [on, setOn] = useState<string[]>(['Product updates', 'Marketing emails'])
      const parentRef = useRef<HTMLInputElement>(null)

      const all = on.length === CHILDREN.length
      const none = on.length === 0

      useEffect(() => {
        // `indeterminate` is a DOM property, not an attribute, so it can only
        // be set through a ref — there is no JSX prop for it.
        if (parentRef.current) parentRef.current.indeterminate = !all && !none
      }, [all, none])

      return (
        <div className="flex flex-col gap-2">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-text-primary">
            <Checkbox
              ref={parentRef}
              checked={all}
              onChange={(e) => setOn(e.target.checked ? [...CHILDREN] : [])}
              aria-label="Select all"
            />
            Select all
          </label>
          <div className="ml-3 flex flex-col gap-2 border-l border-border-default pl-4">
            {CHILDREN.map((c) => (
              <label key={c} className="flex cursor-pointer items-center gap-2 text-sm text-text-primary">
                <Checkbox
                  checked={on.includes(c)}
                  onChange={(e) => setOn((prev) => (e.target.checked ? [...prev, c] : prev.filter((x) => x !== c)))}
                  aria-label={c}
                />
                {c}
              </label>
            ))}
          </div>
        </div>
      )
    }
    return <Tree />
  },
  play: async ({ canvas }) => {
    // Two of three on -> the parent is neither checked nor unchecked.
    const parent = canvas.getByRole('checkbox', { name: 'Select all' }) as HTMLInputElement
    await expect(parent.indeterminate).toBe(true)
    await userEvent.click(canvas.getByRole('checkbox', { name: 'Security alerts' }))
    await expect(parent.indeterminate).toBe(false)
    await expect(parent).toBeChecked()
  },
}

/** A checkbox with a supporting line. Note the description is NOT a Checkbox
 *  prop: `SettingRow` and `FormField` already own "label + description +
 *  control", and a third owner would drift from both. The caller composes it. */
export const WithDescription: Story = {
  render: () => (
    <label className="flex max-w-80 cursor-pointer items-start gap-2.5">
      <Checkbox defaultChecked className="mt-0.5" aria-label="Option label" />
      <span>
        <span className="block text-sm text-text-primary">Option label</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-text-muted">
          This is a supporting description that provides more details.
        </span>
      </span>
    </label>
  ),
}

/** Where this actually earns its place: a form you press Save on.
 *
 *  The connection form's booleans are Checkboxes, not Switches, because they
 *  write to a draft that Cancel discards — a switch would promise an immediacy
 *  it doesn't have. Settings are the opposite and keep their Switches. */
export const InAForm: Story = {
  render: () => {
    function Form() {
      const [ssl, setSsl] = useState(true)
      const [autoCommit, setAutoCommit] = useState(false)
      return (
        <div className="flex w-72 flex-col gap-3 rounded-lg border border-border-default bg-bg-secondary p-4">
          <div className="text-xs font-semibold text-text-primary">Options</div>
          {[
            { label: 'Use SSL', v: ssl, set: setSsl },
            { label: 'Auto-commit by default', v: autoCommit, set: setAutoCommit },
          ].map(({ label, v, set }) => (
            <label key={label} className="flex cursor-pointer items-center gap-2 self-start">
              <Checkbox checked={v} onChange={(e) => set(e.target.checked)} />
              <span className="text-sm text-text-secondary">{label}</span>
            </label>
          ))}
          <div className="mt-1 flex justify-end gap-2 border-t border-border-default pt-3">
            <span className="text-[10px] text-text-muted">nothing applies until Save</span>
          </div>
        </div>
      )
    }
    return <Form />
  },
}
