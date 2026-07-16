import type { Meta, StoryObj } from '@storybook/react-vite'
import { PluginIcon } from './PluginIcon'
import type { PluginInfo } from './PluginsPanel'

const basePlugin: PluginInfo = {
  name: 'postgresql',
  displayName: 'PostgreSQL',
  version: '1.0.0',
  description: 'PostgreSQL driver',
  bundled: true,
  status: { state: 'active' },
  contributions: ['driver'],
}

const meta: Meta<typeof PluginIcon> = {
  title: 'Components/Plugins/PluginIcon',
  component: PluginIcon,
}
export default meta

type Story = StoryObj<typeof meta>

/** Plugin with an explicit icon URL — renders the image. */
export const WithIcon: Story = {
  args: {
    plugin: {
      ...basePlugin,
      name: 'snowflake',
      displayName: 'Snowflake',
      icon: 'https://www.snowflake.com/wp-content/themes/snowflake/assets/img/brand-guidelines/logo-sno-blue.svg',
    },
  },
}

/** No icon — falls back to a gradient tile with the first initial. */
export const GradientInitial: Story = {
  args: {
    plugin: basePlugin,
  },
}

/** Larger size (as used in the plugin detail header). */
export const Large: Story = {
  args: {
    plugin: basePlugin,
    size: 'lg',
  },
}

/** The colour is seeded on the plugin's id, so it's stable per plugin and
 *  spreads across the identity palette rather than repeating. */
export const IdentityColours: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 10 }}>
      {['postgresql', 'mysql', 'sqlite', 'mongodb', 'redis', 'snowflake', 'db-tools', 'core-themes'].map(
        (name) => (
          <PluginIcon
            key={name}
            size="lg"
            plugin={{ ...basePlugin, name, displayName: name.replace(/-/g, ' ') }}
          />
        )
      )}
    </div>
  ),
}
