/**
 * Verql brand mark components.
 *
 * Geometry lives in `assets/brand/verql-mark-*.svg` — those files are the
 * single source of truth. Edit the SVG, the change propagates to every
 * consumer. The component just `<img>`s the right pre-tinted variant:
 *
 *   color  — brand palette (violet + cyan ribbons). Works on any surface.
 *   light  — frost (white-ish) silhouette. Use on dark surfaces.
 *   dark   — midnight silhouette. Use on light surfaces.
 *   auto   — picks light/dark from the active theme's `type` (default).
 *
 * No CSS-mask hacks, no inlined SVG geometry. Just `<img>` + a real URL
 * resolved by Vite at build time, so failures are loud and the icon
 * either renders or 404s (rather than silently collapsing to a colored
 * rectangle, like the mask approach did).
 */

import type { CSSProperties } from 'react'
import { useThemesStore } from '@/stores/themes'
import { useTheme } from '@/primitives/theme/ThemeProvider'
import colorUrl from '@/assets/brand/verql-mark-color.svg?url'
import lightUrl from '@/assets/brand/verql-mark-mono-light.svg?url'
import darkUrl from '@/assets/brand/verql-mark-mono-dark.svg?url'

type Variant = 'color' | 'light' | 'dark' | 'auto'

interface MarkProps {
  size?: number
  className?: string
  variant?: Variant
  style?: CSSProperties
  /** Set for decorative use to keep it out of the accessibility tree. */
  alt?: string
}

const VARIANT_URL: Record<Exclude<Variant, 'auto'>, string> = {
  color: colorUrl,
  light: lightUrl,
  dark: darkUrl,
}

function useResolvedVariant(variant: Variant): Exclude<Variant, 'auto'> {
  const { theme } = useTheme()
  const themes = useThemesStore((s) => s.themes)
  if (variant !== 'auto') return variant
  const active = themes.find((t) => t.id === theme)
  return active?.type === 'light' ? 'dark' : 'light'
}

export function VerqlMark({
  size = 16,
  className,
  variant = 'auto',
  style,
  alt = '',
}: MarkProps) {
  const resolved = useResolvedVariant(variant)
  return (
    <img
      src={VARIANT_URL[resolved]}
      width={size}
      height={size}
      alt={alt}
      aria-hidden={alt === '' ? true : undefined}
      className={className}
      style={style}
      draggable={false}
    />
  )
}
