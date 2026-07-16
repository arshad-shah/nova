import { Flex, Box } from '@/primitives'
import type { PluginInfo } from './PluginsPanel'

export const ICON_GRADIENTS = [
  'from-blue-500 to-blue-600',
  'from-emerald-500 to-emerald-600',
  'from-purple-500 to-purple-600',
  'from-red-500 to-red-600',
  'from-amber-500 to-amber-600',
  'from-cyan-500 to-cyan-600',
  'from-pink-500 to-pink-600',
  'from-indigo-500 to-indigo-600',
]

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
      <Box
        as="img"
        src={plugin.icon}
        alt={plugin.displayName}
        className="rounded-lg object-cover shrink-0"
        style={{ width: size, height: size }}
      />
    )
  }
  const gradient = ICON_GRADIENTS[hashToIndex(plugin.name, ICON_GRADIENTS.length)]
  return (
    <Flex
      align="center"
      justify="center"
      className={`bg-gradient-to-br ${gradient} rounded-lg text-white font-bold shrink-0`}
      style={{ width: size, height: size, fontSize: size * 0.43 }}
    >
      {plugin.displayName.charAt(0).toUpperCase()}
    </Flex>
  )
}
