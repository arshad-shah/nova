import { Flex } from '@/primitives'
import { decorativeColor, DECORATIVE_COUNT } from '@/primitives/theme/theme-color'
import type { PluginInfo } from './PluginsPanel'

export function hashToIndex(str: string, max: number): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0
  }
  return Math.abs(hash) % max
}

export function PluginIcon({ plugin, size = 28 }: { plugin: PluginInfo; size?: number }) {
  if (plugin.icon) {
    return (
      <img
        src={plugin.icon}
        alt={plugin.displayName}
        className="rounded-lg object-cover shrink-0"
        style={{ width: size, height: size }}
      />
    )
  }
  // Deterministic hue from the theme's decorative ramp (1-based).
  const hue = decorativeColor(hashToIndex(plugin.name, DECORATIVE_COUNT) + 1)
  return (
    <Flex
      align="center"
      justify="center"
      className="rounded-lg text-text-inverse font-bold shrink-0"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.43,
        background: `linear-gradient(135deg, ${hue}, color-mix(in oklab, ${hue}, black 18%))`,
      }}
    >
      {plugin.displayName.charAt(0).toUpperCase()}
    </Flex>
  )
}
