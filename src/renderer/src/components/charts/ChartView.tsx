import { useEffect, useMemo } from 'react'
import { Line, Bar, Pie, Scatter } from '@arshad-shah/swift-chart/react'
import { addTheme } from '@arshad-shah/swift-chart'
import type { ChartType } from './chart-detect'
import { Flex, Text } from '@/primitives'
import { useTheme } from '@/primitives/theme/ThemeProvider'
import { useTranslation } from '@/i18n/I18nProvider'

const THEME_NAME = 'verql'

/**
 * Ion values, mirroring `primitives/theme/baseline.css`. The chart library
 * needs concrete colours — it can't resolve `var(--…)` — so every value below
 * is read from the live theme first and only falls back here if the token is
 * missing. Baseline.css declares all of them on `:root`, so in practice these
 * fire only if that stylesheet failed to load.
 */
const FALLBACK = {
  bg: '#0B0F16',
  surface: '#1A2233',
  text: '#F2F4F7',
  textMuted: '#66738A',
  border: '#252E3F',
  accent: '#7A5CFF',
  accentEmphasis: '#5B43F6',
  dataAccent: '#00D4FF',
  ok: '#34D399',
  warn: '#FBBF24',
  danger: '#F87171',
} as const

function readVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

function registerVerqlTheme(): void {
  addTheme(THEME_NAME, {
    bg: readVar('--color-bg-primary', FALLBACK.bg),
    surface: readVar('--color-bg-secondary', FALLBACK.surface),
    grid: readVar('--color-border-subtle', 'rgba(203,213,225,0.09)'),
    text: readVar('--color-text-primary', FALLBACK.text),
    textMuted: readVar('--color-text-tertiary', FALLBACK.textMuted),
    axis: readVar('--color-border-default', FALLBACK.border),
    positive: readVar('--color-success', FALLBACK.ok),
    negative: readVar('--color-error', FALLBACK.danger),
    onAccent: readVar('--color-text-inverse', FALLBACK.bg),
    // Series colours walk the theme's own accents before reaching for status
    // hues, so a chart reads as data rather than as a row of alerts.
    colors: [
      readVar('--color-accent', FALLBACK.accent),
      readVar('--color-data-accent', FALLBACK.dataAccent),
      readVar('--color-accent-emphasis', FALLBACK.accentEmphasis),
      readVar('--color-success', FALLBACK.ok),
      readVar('--color-warning', FALLBACK.warn),
      readVar('--color-error', FALLBACK.danger),
    ],
    tooltipBg: readVar('--color-bg-elevated', FALLBACK.surface),
    tooltipBorder: readVar('--color-border-strong', 'rgba(203,213,225,0.18)'),
    tooltipText: readVar('--color-text-primary', FALLBACK.text),
  })
}

interface Props {
  type: ChartType
  data: Record<string, unknown>[]
  xKey: string
  yKey: string
}

export function ChartView({ type, data, xKey, yKey }: Props) {
  const { t } = useTranslation()
  const { theme } = useTheme()

  // Re-register the palette whenever the active theme id changes so
  // swift-chart's bake step picks up new CSS variable values.
  useEffect(() => {
    registerVerqlTheme()
  }, [theme])

  const common = useMemo(
    () => ({ data, theme: THEME_NAME, height: '100%' as const }),
    [data],
  )

  if (type === 'none' || data.length === 0) {
    return (
      <Flex align="center" justify="center" className="h-full">
        <Text size="sm" color="muted">{t('shell.charts.noChartAvailable')}</Text>
      </Flex>
    )
  }

  switch (type) {
    case 'bar':
      return <Bar {...common} mapping={{ x: xKey, y: yKey }} />
    case 'line':
      return <Line {...common} mapping={{ x: xKey, y: yKey }} />
    case 'pie':
      return <Pie {...common} mapping={{ labelField: xKey, valueField: yKey }} />
    case 'scatter':
      return <Scatter {...common} mapping={{ x: xKey, y: yKey }} />
    default:
      return null
  }
}
