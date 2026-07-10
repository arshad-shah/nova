import { useEffect, useMemo } from 'react'
import { Line, Bar, Pie, Scatter } from '@arshad-shah/swift-chart/react'
import { addTheme } from '@arshad-shah/swift-chart'
import type { ChartType } from './chart-detect'
import { Flex, Text } from '@/primitives'
import { useTheme } from '@/primitives/theme/ThemeProvider'
import { useTranslation } from '@/i18n/I18nProvider'
import { themeColor } from '@/primitives/theme/theme-color'

const THEME_NAME = 'verql'

function registerVerqlTheme(): void {
  addTheme(THEME_NAME, {
    bg: themeColor('--color-bg-primary'),
    surface: themeColor('--color-bg-secondary'),
    grid: themeColor('--color-border-subtle'),
    text: themeColor('--color-text-primary'),
    textMuted: themeColor('--color-text-tertiary'),
    axis: themeColor('--color-border-default'),
    positive: themeColor('--color-success'),
    negative: themeColor('--color-error'),
    onAccent: themeColor('--color-text-inverse'),
    colors: [
      themeColor('--color-accent'),
      themeColor('--color-accent-emphasis'),
      themeColor('--color-success'),
      themeColor('--color-warning'),
      themeColor('--color-error'),
      themeColor('--color-accent-hover'),
    ],
    tooltipBg: themeColor('--color-bg-elevated'),
    tooltipBorder: themeColor('--color-border-strong'),
    tooltipText: themeColor('--color-text-primary'),
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
