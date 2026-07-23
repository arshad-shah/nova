import React, { useState, useRef, useCallback, useEffect } from 'react'
import { cn } from '../utils/cn'
import {
  clamp,
  hsvToRgb,
  hslToRgb,
  rgbToHsv,
  rgbToHsl,
  rgbToHex,
  parseColor,
  formatColor,
  isValidColor,
} from './color-utils'

export type ColorFormat = 'hex' | 'rgb' | 'hsl'

export interface ColorPickerProps {
  value: string
  onChange: (color: string) => void
  format?: ColorFormat
  presets?: string[]
  showEyeDropper?: boolean
  showPresets?: boolean
}

const DEFAULT_PRESETS = [
  '#ff0000', '#ff8000', '#ffff00', '#80ff00', '#00ff00', '#00ff80',
  '#00ffff', '#0080ff', '#0000ff', '#8000ff', '#ff00ff', '#ff0080',
  '#ffffff', '#c0c0c0', '#808080', '#404040', '#000000', 'transparent',
]

const HUE_GRADIENT = 'linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)'
const CHECKER_BG = 'repeating-conic-gradient(#808080 0% 25%, transparent 0% 50%) 50% / 8px 8px'

export function ColorPicker({
  value,
  onChange,
  format: initialFormat = 'hex',
  presets = DEFAULT_PRESETS,
  showEyeDropper = true,
  showPresets = true,
}: ColorPickerProps) {
  const [h, setH] = useState(0)
  const [s, setS] = useState(100)
  const [v, setV] = useState(100)
  const [a, setA] = useState(1)
  const [format, setFormat] = useState<ColorFormat>(initialFormat)
  const [copyLabel, setCopyLabel] = useState('Copy')

  const svRef = useRef<HTMLDivElement>(null)
  const hueRef = useRef<HTMLDivElement>(null)
  const alphaRef = useRef<HTMLDivElement>(null)

  // Sync from prop on mount and when value changes externally
  useEffect(() => {
    const [r, g, b, alpha] = parseColor(value)
    const [hv, sv, vv] = rgbToHsv(r, g, b)
    setH(hv); setS(sv); setV(vv); setA(alpha)
  }, [value])

  const fireChange = useCallback(
    (h: number, s: number, v: number, a: number) => {
      const [r, g, b] = hsvToRgb(h, s, v)
      onChange(formatColor(r, g, b, a, format))
    },
    [onChange, format]
  )

  // --- Drag helper ---
  const useDrag = useCallback(
    (ref: React.RefObject<HTMLDivElement | null>, onMove: (e: PointerEvent, rect: DOMRect) => void) => {
      return (e: React.PointerEvent) => {
        e.preventDefault()
        e.stopPropagation()
        const el = ref.current
        if (!el) return
        const rect = el.getBoundingClientRect()
        onMove(e.nativeEvent, rect)

        const move = (ev: PointerEvent) => { ev.preventDefault(); onMove(ev, rect) }
        const up = () => {
          document.removeEventListener('pointermove', move)
          document.removeEventListener('pointerup', up)
        }
        document.addEventListener('pointermove', move)
        document.addEventListener('pointerup', up)
      }
    },
    []
  )

  // --- SV canvas drag ---
  const handleSvDrag = useDrag(svRef, (e, rect) => {
    const ns = clamp((e.clientX - rect.left) / rect.width * 100, 0, 100)
    const nv = clamp(100 - (e.clientY - rect.top) / rect.height * 100, 0, 100)
    setS(ns); setV(nv)
    fireChange(h, ns, nv, a)
  })

  // --- Hue track drag ---
  const handleHueDrag = useDrag(hueRef, (e, rect) => {
    const nh = clamp((e.clientX - rect.left) / rect.width * 360, 0, 360)
    setH(nh)
    fireChange(nh, s, v, a)
  })

  // --- Alpha track drag ---
  const handleAlphaDrag = useDrag(alphaRef, (e, rect) => {
    const na = clamp((e.clientX - rect.left) / rect.width, 0, 1)
    setA(na)
    fireChange(h, s, v, na)
  })

  // --- Derived values ---
  const [r, g, b] = hsvToRgb(h, s, v)
  const rgba = `rgba(${r},${g},${b},${a})`
  const hueColor = `hsl(${h},100%,50%)`
  const alphaGradient = `linear-gradient(to right, transparent, rgb(${r},${g},${b}))`

  // --- Format inputs ---
  const handleInputChange = useCallback(
    (updates: Record<string, string>) => {
      if (format === 'hex') {
        const hex = updates.hex || ''
        if (isValidColor(hex.startsWith('#') ? hex : '#' + hex)) {
          const [nr, ng, nb, na] = parseColor(hex.startsWith('#') ? hex : '#' + hex)
          const [nh, ns, nv] = rgbToHsv(nr, ng, nb)
          setH(nh); setS(ns); setV(nv); setA(na)
          fireChange(nh, ns, nv, na)
        }
      } else if (format === 'rgb') {
        const nr = clamp(+(updates.r ?? r), 0, 255)
        const ng = clamp(+(updates.g ?? g), 0, 255)
        const nb = clamp(+(updates.b ?? b), 0, 255)
        const na = clamp(+(updates.a ?? a), 0, 1)
        const [nh, ns, nv] = rgbToHsv(nr, ng, nb)
        setH(nh); setS(ns); setV(nv); setA(na)
        fireChange(nh, ns, nv, na)
      } else if (format === 'hsl') {
        const [hslH, hslS, hslL] = rgbToHsl(r, g, b)
        const nh = clamp(+(updates.h ?? hslH), 0, 360)
        const ns = clamp(+(updates.s ?? hslS), 0, 100)
        const nl = clamp(+(updates.l ?? hslL), 0, 100)
        const na = clamp(+(updates.a ?? a), 0, 1)
        const [cr, cg, cb] = hslToRgb(nh, ns, nl)
        const [cvh, cvs, cvv] = rgbToHsv(cr, cg, cb)
        setH(cvh); setS(cvs); setV(cvv); setA(na)
        fireChange(cvh, cvs, cvv, na)
      }
    },
    [format, r, g, b, a, h, fireChange]
  )

  // --- Eyedropper ---
  const handleEyeDropper = useCallback(async () => {
    if (!('EyeDropper' in window)) return
    try {
      const result = await new (window as any).EyeDropper().open()
      const [nr, ng, nb] = parseColor(result.sRGBHex)
      const [nh, ns, nv] = rgbToHsv(nr, ng, nb)
      setH(nh); setS(ns); setV(nv); setA(1)
      fireChange(nh, ns, nv, 1)
    } catch {
      // User cancelled
    }
  }, [fireChange])

  // --- Copy ---
  const handleCopy = useCallback(() => {
    const colorStr = formatColor(r, g, b, a, format)
    navigator.clipboard.writeText(colorStr)
    setCopyLabel('Copied!')
    setTimeout(() => setCopyLabel('Copy'), 1000)
  }, [r, g, b, a, format])

  // --- Preset click ---
  const handlePresetClick = useCallback(
    (color: string) => {
      const [nr, ng, nb, na] = parseColor(color)
      const [nh, ns, nv] = rgbToHsv(nr, ng, nb)
      setH(nh); setS(ns); setV(nv); setA(na)
      fireChange(nh, ns, nv, na)
    },
    [fireChange]
  )

  // --- Input field values ---
  const hexValue = rgbToHex(r, g, b, a)
  const [hslH, hslS, hslL] = rgbToHsl(r, g, b)
  const roundedA = Math.round(a * 100) / 100

  const hasEyeDropper = showEyeDropper && typeof window !== 'undefined' && 'EyeDropper' in window

  return (
    <div
      className="w-60 rounded-lg border border-border-default bg-bg-secondary p-3 shadow-dropdown"
      onClick={(e) => e.stopPropagation()}
    >
      {/* HSV Saturation/Value Canvas */}
      <div
        ref={svRef}
        className="relative h-40 w-full cursor-crosshair rounded overflow-hidden select-none"
        onPointerDown={handleSvDrag}
      >
        <div className="absolute inset-0" style={{ background: hueColor }} />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to right, #fff, transparent)' }} />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, #000, transparent)' }} />
        {/* Pointer */}
        <div
          className="absolute w-3.5 h-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-on-fill-dark shadow-md pointer-events-none"
          style={{ left: `${s}%`, top: `${100 - v}%` }}
        />
      </div>

      {/* Sliders row */}
      <div className="mt-3 flex items-center gap-2">
        {/* Color preview */}
        <div
          className="w-8 h-8 rounded border border-border-default shrink-0 overflow-hidden"
          style={{ background: CHECKER_BG }}
        >
          <div className="w-full h-full" style={{ background: rgba }} />
        </div>

        <div className="flex-1 flex flex-col gap-1.5">
          {/* Hue track */}
          <div
            ref={hueRef}
            className="relative h-3 w-full rounded-full cursor-pointer select-none"
            style={{ background: HUE_GRADIENT }}
            onPointerDown={handleHueDrag}
          >
            <div
              className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 border-on-fill-dark shadow-md pointer-events-none"
              style={{ left: `${(h / 360) * 100}%` }}
            />
          </div>

          {/* Alpha track */}
          <div
            ref={alphaRef}
            className="relative h-3 w-full rounded-full cursor-pointer select-none overflow-hidden"
            style={{ background: CHECKER_BG }}
            onPointerDown={handleAlphaDrag}
          >
            <div className="absolute inset-0 rounded-full" style={{ background: alphaGradient }} />
            <div
              className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 border-on-fill-dark shadow-md pointer-events-none"
              style={{ left: `${a * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Actions row: eyedropper + copy */}
      <div className="mt-2 flex items-center gap-1">
        {hasEyeDropper && (
          <button
            type="button"
            onClick={handleEyeDropper}
            className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-hover transition-all duration-(--transition-fast)"
            title="Pick from screen"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.71 5.63l-2.34-2.34a1 1 0 00-1.41 0l-3.12 3.12-1.41-1.42-1.42 1.42 1.42 1.41-9.19 9.19a1 1 0 000 1.41l2.34 2.34a1 1 0 001.41 0l9.19-9.19 1.42 1.42 1.41-1.42-1.41-1.41 3.12-3.12a1 1 0 000-1.41zM6.41 19L5 17.59l8.49-8.49 1.41 1.41L6.41 19z" />
            </svg>
          </button>
        )}
        <button
          type="button"
          onClick={handleCopy}
          className={cn(
            'ml-auto px-2 py-0.5 rounded text-xs transition-all duration-(--transition-fast)',
            copyLabel === 'Copied!'
              ? 'text-success bg-success/10'
              : 'text-text-muted hover:text-text-primary hover:bg-hover'
          )}
        >
          {copyLabel}
        </button>
      </div>

      {/* Format buttons */}
      <div className="mt-2 flex gap-1">
        {(['hex', 'rgb', 'hsl'] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFormat(f)}
            className={cn(
              'flex-1 py-1 rounded text-xs font-medium uppercase transition-all duration-(--transition-fast)',
              format === f
                ? 'bg-accent text-text-inverse'
                : 'text-text-muted hover:text-text-primary hover:bg-hover'
            )}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Input fields */}
      <div className="mt-2 flex gap-1">
        {format === 'hex' ? (
          <div className="flex-1 flex flex-col items-center">
            <input
              type="text"
              value={hexValue}
              onChange={(e) => handleInputChange({ hex: e.target.value })}
              aria-label="HEX color value"
              className="w-full h-6 px-1.5 rounded border border-border-default bg-bg-tertiary text-text-primary text-xs text-center font-mono outline-none focus:border-accent transition-colors"
            />
            <span className="text-[10px] text-text-muted mt-0.5">HEX</span>
          </div>
        ) : format === 'rgb' ? (
          <>
            {[
              { id: 'r', label: 'R', value: r, max: 255 },
              { id: 'g', label: 'G', value: g, max: 255 },
              { id: 'b', label: 'B', value: b, max: 255 },
              { id: 'a', label: 'A', value: roundedA, max: 1, step: 0.01 },
            ].map((field) => (
              <div key={field.id} className="flex-1 flex flex-col items-center">
                <input
                  type="number"
                  value={field.value}
                  min={0}
                  max={field.max}
                  step={field.step}
                  onChange={(e) => handleInputChange({ [field.id]: e.target.value })}
                  aria-label={field.label}
                  className="w-full h-6 px-1 rounded border border-border-default bg-bg-tertiary text-text-primary text-xs text-center font-mono outline-none focus:border-accent transition-colors [&::-webkit-inner-spin-button]:appearance-none"
                />
                <span className="text-[10px] text-text-muted mt-0.5">{field.label}</span>
              </div>
            ))}
          </>
        ) : (
          <>
            {[
              { id: 'h', label: 'H', value: hslH, max: 360 },
              { id: 's', label: 'S', value: hslS, max: 100 },
              { id: 'l', label: 'L', value: hslL, max: 100 },
              { id: 'a', label: 'A', value: roundedA, max: 1, step: 0.01 },
            ].map((field) => (
              <div key={field.id} className="flex-1 flex flex-col items-center">
                <input
                  type="number"
                  value={field.value}
                  min={0}
                  max={field.max}
                  step={field.step}
                  onChange={(e) => handleInputChange({ [field.id]: e.target.value })}
                  aria-label={field.label}
                  className="w-full h-6 px-1 rounded border border-border-default bg-bg-tertiary text-text-primary text-xs text-center font-mono outline-none focus:border-accent transition-colors [&::-webkit-inner-spin-button]:appearance-none"
                />
                <span className="text-[10px] text-text-muted mt-0.5">{field.label}</span>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Preset swatches */}
      {showPresets && presets.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {presets.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => handlePresetClick(color)}
              className={cn(
                'w-5 h-5 rounded border transition-all duration-(--transition-fast) hover:scale-110',
                (() => {
                  const [pr, pg, pb] = parseColor(color)
                  return pr === r && pg === g && pb === b
                    ? 'border-accent scale-110'
                    : 'border-border-default'
                })()
              )}
              style={{
                background: color === 'transparent' ? CHECKER_BG : color,
              }}
              title={color}
            />
          ))}
        </div>
      )}
    </div>
  )
}
