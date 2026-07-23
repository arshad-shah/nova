import type { ReactNode } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { SeverityIcon } from './SeverityIcon'
import { SEVERITY_TONE, type Severity } from './severity'

const SEVERITIES: Severity[] = ['neutral', 'info', 'success', 'warning', 'error', 'update']

/** SeverityIcon reads its two colours (`--fb-vc`, `--fb-glyph`) from custom
 *  properties the surrounding feedback surface sets — so a bare icon has no
 *  colour of its own. In real use Toast/Alert provide them; here we apply
 *  `SEVERITY_TONE` on a wrapper so the mark renders as it would in context. */
function Toned({ severity, children }: { severity: Severity; children: ReactNode }) {
  return <span className={SEVERITY_TONE[severity]}>{children}</span>
}

const meta = {
  title: 'Primitives/Feedback/SeverityIcon',
  component: SeverityIcon,
  argTypes: {
    severity: { control: 'select', options: SEVERITIES },
    loading: { control: 'boolean' },
    size: { control: { type: 'number', min: 12, max: 64, step: 2 } },
  },
  args: { severity: 'success', size: 24 },
  // Every story needs the tone vars in scope; wrap the rendered component.
  decorators: [
    (Story, ctx) => (
      <Toned severity={(ctx.args.severity as Severity) ?? 'neutral'}>
        <Story />
      </Toned>
    ),
  ],
} satisfies Meta<typeof SeverityIcon>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

/** The five states plus the brand's `update`. Each is a filled shape with its
 *  glyph knocked out — drawn with `fill` + `stroke` so it reads at 16px where a
 *  hairline outline muddies. */
export const Severities: Story = {
  render: () => (
    <div className="flex items-center gap-5">
      {SEVERITIES.map((severity) => (
        <div key={severity} className="text-center">
          <Toned severity={severity}>
            <SeverityIcon severity={severity} size={24} />
          </Toned>
          <div className="mt-2 text-[10px] text-text-muted">{severity}</div>
        </div>
      ))}
    </div>
  ),
}

/** The mark holds up across the range it's used at — 16px in a Toast, larger in
 *  an empty state. */
export const Sizes: Story = {
  render: () => (
    <div className="flex items-end gap-4">
      {[16, 20, 24, 32, 48].map((size) => (
        <div key={size} className="text-center">
          <Toned severity="error">
            <SeverityIcon severity="error" size={size} />
          </Toned>
          <div className="mt-2 text-[10px] text-text-muted">{size}px</div>
        </div>
      ))}
    </div>
  ),
}

/** `loading` swaps the mark for a spinner in the same tone — for a check still
 *  in flight, before its verdict is known. */
export const Loading: Story = {
  args: { severity: 'info', loading: true, size: 24 },
}
