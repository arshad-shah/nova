/**
 * Generate every Verql brand artifact from `mark.mjs`.
 *
 *   node scripts/brand/build-brand.mjs          # everything
 *   node scripts/brand/build-brand.mjs --check  # fail if anything is stale (CI)
 *
 * Emits:
 *   src/renderer/src/assets/brand/*.svg   in-app marks (colour, mono, currentColor, hero)
 *   build/icon.svg, build/icon-light.svg  app-icon tiles
 *   build/icon*.png .icns .ico            platform icons (rasterised)
 *   build/icons/**                        Linux png set electron-builder picks up
 *   build/appx/**                         Microsoft Store tiles — upload-ready
 *   site/src/assets/*.svg, site/public/favicon.svg
 *
 * Everything below is generated. The ONLY place to change the mark is mark.mjs —
 * that's what stops the app and the site drifting apart, which is exactly how
 * the site ended up shipping the retired logo.
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync, mkdtempSync, rmSync } from 'fs'
import { execFileSync } from 'child_process'
import { tmpdir } from 'os'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import { buildMark, TILE_LIGHT, TILE_DARK_DEF } from './mark.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const CHECK = process.argv.includes('--check')

const written = []
const stale = []

function emit(relPath, contents) {
  const full = join(ROOT, relPath)
  if (CHECK) {
    const current = existsSync(full) ? readFileSync(full, 'utf8') : null
    if (current !== contents) stale.push(relPath)
    return
  }
  mkdirSync(dirname(full), { recursive: true })
  writeFileSync(full, contents)
  written.push(relPath)
}

function rasteriseWH(svgRel, pngRel, w, h) {
  if (CHECK) return
  const out = join(ROOT, pngRel)
  mkdirSync(dirname(out), { recursive: true })
  execFileSync('rsvg-convert', ['-w', String(w), '-h', String(h), join(ROOT, svgRel), '-o', out])
  written.push(`${pngRel} (${w}×${h})`)
}

const rasterise = (svgRel, pngRel, size) => rasteriseWH(svgRel, pngRel, size, size)

// ── The tile variants need the gradient def injected ─────────────────────────
function tileSvg(kind) {
  const dark = kind === 'dark'
  const svg = buildMark('color', {
    tile: dark ? 'url(#vq-tile)' : TILE_LIGHT,
    shadow: true,
    comment: dark
      ? 'Verql app icon — the mark on the dark tile.\nUsed for the dock, taskbar, and the Microsoft Store.'
      : 'Verql app icon — LIGHT variant.\nFor light-mode docks, white documentation and print.',
  })
  return dark ? svg.replace('<defs>', `<defs>${TILE_DARK_DEF}`) : svg
}

// ── 1 · In-app marks ─────────────────────────────────────────────────────────
emit('src/renderer/src/assets/brand/verql-mark-color.svg', buildMark('color', {
  comment: 'Verql mark — full colour. Transparent; drop on any dark surface.',
}))
emit('src/renderer/src/assets/brand/verql-mark-mono-light.svg', buildMark('mono-light', {
  comment: 'Verql mark — frost silhouette, for DARK surfaces.\nCarries the outer contour: flattened to one tone the three shapes\nwould merge into a blob and vanish on a same-tone background.',
}))
emit('src/renderer/src/assets/brand/verql-mark-mono-dark.svg', buildMark('mono-dark', {
  comment: 'Verql mark — midnight silhouette, for LIGHT surfaces.\nCarries the outer contour (see mono-light).',
}))
emit('src/renderer/src/assets/brand/verql-mark.svg', buildMark('currentColor', {
  comment: 'Verql mark — flat silhouette in currentColor.\nInherits the surrounding text/accent colour.',
}))
emit('src/renderer/src/assets/brand/verql-hero.svg', buildMark('color', {
  comment: 'Verql hero — the mark for brand moments (splash, welcome, release notes).\nCarries the brand gradient rather than currentColor: the hero is one of the\nfew surfaces the gradient is reserved for.',
}))

// ── 2 · App-icon tiles ───────────────────────────────────────────────────────
emit('build/icon.svg', tileSvg('dark'))
emit('build/icon-light.svg', tileSvg('light'))

// ── 2b · The boot splash's inlined mark ──────────────────────────────────────
// It paints before the bundle exists, so it can't import an asset — it has to
// be inline. Rather than a comment asking a human to keep two copies in step
// (which is exactly how the retired mark survived here), the generator owns the
// block between the markers.
{
  const rel = 'src/renderer/index.html'
  const html = readFileSync(join(ROOT, rel), 'utf8')
  const START = '<!-- verql:boot-mark:start -->'
  const END = '<!-- verql:boot-mark:end -->'
  const a = html.indexOf(START)
  const b = html.indexOf(END)
  if (a === -1 || b === -1) {
    console.error(`${rel}: missing ${START} / ${END} markers — cannot inline the boot mark.`)
    process.exit(1)
  }
  const inline = buildMark('color', { comment: 'Boot splash mark.' })
    .replace(/^<svg /, '<svg class="boot-splash__mark" ')
    .split('\n')
    .map((l, i) => (i === 0 ? `        ${l}` : `        ${l}`))
    .join('\n')
    .trimEnd()
  const next = html.slice(0, a) + START + '\n' +
    '        <!-- GENERATED by scripts/brand/build-brand.mjs — do not edit by hand.\n' +
    '             The mark must be inlined (this splash paints before the React bundle\n' +
    '             and Vite\'s asset URLs exist), so the generator writes it in rather\n' +
    '             than a comment asking a human to remember. `pnpm brand:check` fails\n' +
    '             the build if it drifts. -->\n' +
    inline + '\n        ' + html.slice(b)
  emit(rel, next)
}

// ── 3 · Site (generated — this is what stops the site drifting) ──────────────
emit('site/src/assets/verql-mark-color.svg', buildMark('color', { comment: 'Verql mark — full colour.' }))
emit('site/src/assets/verql-mark-mono-light.svg', buildMark('mono-light', { comment: 'Verql mark — frost silhouette, for dark surfaces.' }))
emit('site/src/assets/verql-mark-mono-dark.svg', buildMark('mono-dark', { comment: 'Verql mark — midnight silhouette, for light surfaces.' }))
emit('site/src/assets/verql-icon.svg', tileSvg('dark'))
emit('site/public/favicon.svg', tileSvg('dark'))
emit('site/src/assets/verql-logo-dark.svg', buildMark('mono-light', { comment: 'Verql site header mark, for the dark header.' }))
emit('site/src/assets/verql-logo-light.svg', buildMark('mono-dark', { comment: 'Verql site header mark, for the light header.' }))

// ── 4 · Rasters ──────────────────────────────────────────────────────────────
if (!CHECK) {
  rasterise('build/icon.svg', 'build/icon.png', 1024)
  rasterise('build/icon.svg', 'build/icon-dark.png', 1024)
  rasterise('build/icon-light.svg', 'build/icon-light.png', 1024)

  // Linux set — electron-builder discovers build/icons/ implicitly.
  for (const s of [16, 24, 32, 48, 64, 128, 256, 512, 1024]) {
    rasterise('build/icon.svg', `build/icons/${s}x${s}.png`, s)
    rasterise('build/icon.svg', `build/icons/png/${s}x${s}.png`, s)
  }

  // ── 5 · Microsoft Store tiles — upload-ready, no hand-editing ──────────────
  // electron-builder uses build/appx/ verbatim when present; without it, it
  // auto-derives tiles from icon.ico, which is what the Store rejects.
  const APPX = [
    ['Square44x44Logo.png', 44], ['Square44x44Logo.scale-125.png', 55],
    ['Square44x44Logo.scale-150.png', 66], ['Square44x44Logo.scale-200.png', 88],
    ['Square44x44Logo.scale-400.png', 176],
    ['Square150x150Logo.png', 150], ['Square150x150Logo.scale-125.png', 188],
    ['Square150x150Logo.scale-150.png', 225], ['Square150x150Logo.scale-200.png', 300],
    ['Square150x150Logo.scale-400.png', 600],
    ['Square71x71Logo.png', 71], ['Square310x310Logo.png', 310],
    ['StoreLogo.png', 50], ['StoreLogo.scale-200.png', 100],
  ]
  for (const [name, size] of APPX) rasterise('build/icon.svg', `build/appx/${name}`, size)

  // Wide + splash are not square: the mark is CENTRED on the tile, never
  // stretched. Fit the artwork bbox (221..1087 × 240..951 = 866 × 711) inside
  // the tile with padding, scaling by whichever axis binds first — for a wide
  // tile that's always the height.
  const MARK_W = 866, MARK_H = 711, MARK_X = 221, MARK_Y = 240
  const wide = (w, h, pad = 18) => {
    const s = Math.min((w - pad * 2) / MARK_W, (h - pad * 2) / MARK_H)
    const tx = (w - MARK_W * s) / 2 - MARK_X * s
    const ty = (h - MARK_H * s) / 2 - MARK_Y * s
    return tileSvg('dark')
      .replace('viewBox="0 0 1024 1024"', `viewBox="0 0 ${w} ${h}"`)
      // Square corners: the 232 radius is over half a wide tile's height, which
      // degenerates the rect into an ellipse. The Store masks these itself.
      .replace('<rect width="1024" height="1024" rx="232"', `<rect width="${w}" height="${h}" rx="0"`)
      .replace(
        'transform="translate(13.7 58.2) scale(0.762)"',
        `transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${s.toFixed(4)})"`
      )
  }
  // Intermediates go to a scratch dir, never build/appx — electron-builder
  // packages that folder verbatim, so a stray .svg would ship to the Store.
  const TMP = mkdtempSync(join(tmpdir(), 'verql-brand-'))
  const scratch = (name, contents) => {
    const p = join(TMP, name)
    writeFileSync(p, contents)
    return p
  }
  const rasteriseAbs = (abs, pngRel, w, h) => {
    const out = join(ROOT, pngRel)
    mkdirSync(dirname(out), { recursive: true })
    execFileSync('rsvg-convert', ['-w', String(w), '-h', String(h), abs, '-o', out])
    written.push(`${pngRel} (${w}×${h})`)
  }

  rasteriseAbs(scratch('wide.svg', wide(310, 150)), 'build/appx/Wide310x150Logo.png', 310, 150)
  rasteriseAbs(scratch('splash.svg', wide(620, 300)), 'build/appx/SplashScreen.png', 620, 300)

  // BadgeLogo must be monochrome + alpha only.
  const badge = buildMark('currentColor', { comment: 'Store badge — monochrome, alpha only.' })
    .replace('fill="currentColor"', 'fill="#FFFFFF"')
  rasteriseAbs(scratch('badge.svg', badge), 'build/appx/BadgeLogo.png', 24, 24)

  rmSync(TMP, { recursive: true, force: true })
}

// ── Report ───────────────────────────────────────────────────────────────────
if (CHECK) {
  if (stale.length) {
    console.error('Brand artifacts are stale — run `pnpm brand:build`:')
    for (const f of stale) console.error('  ' + f)
    process.exit(1)
  }
  console.log('Brand artifacts are up to date.')
} else {
  console.log(`Generated ${written.length} brand artifacts from scripts/brand/mark.mjs`)
}
