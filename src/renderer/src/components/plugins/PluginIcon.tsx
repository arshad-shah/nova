import { Avatar } from '@/primitives'
import type { AvatarProps } from '@/primitives'
import type { PluginInfo } from './PluginsPanel'

/**
 * A plugin's tile: its own logo when the manifest ships one, otherwise a letter
 * on a colour derived from its name.
 *
 * This used to be a whole second avatar implementation, forked from the
 * primitive for one reason: Avatar hardcoded `rounded-full` and a plugin is not
 * a person, so it needed a squircle. Now that Avatar has a `shape` axis, the
 * only thing left here is the plugin-to-avatar mapping — which is domain
 * knowledge and belongs in the plugins component, not in a primitive.
 *
 * The old version's gradients were Tailwind palette literals (`from-blue-500`),
 * which no theme could touch; Avatar's identity tones are tokens.
 */
export function PluginIcon({
  plugin,
  size = 'md',
}: {
  plugin: PluginInfo
  size?: AvatarProps['size']
}) {
  return (
    <Avatar
      name={plugin.displayName}
      // Seeded on the id, not the display name: renaming a plugin in its
      // manifest shouldn't change the colour users recognise it by.
      colorSeed={plugin.name}
      src={plugin.icon}
      size={size}
      shape="squircle"
      tone="identity"
    />
  )
}
