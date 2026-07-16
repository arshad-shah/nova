# Visual assets

The mark's source of truth is **`build/icon.svg`** (repo root `build/`). Run
`pnpm build:icons` to regenerate the rasterised PNG/ICO/ICNS. Everything below is
derived from that source.

## Generated icons in the repo

| File | Size | Used for |
|------|------|----------|
| `build/icon.svg` | vector | Source of truth — edit this |
| `build/icon.png` | 1024×1024 | macOS/Linux app icon; downscale for store logos |
| `build/icon.ico` | multi | Windows app icon (baked into the MSIX) |
| `build/icon.icns` | multi | macOS app icon |

## Microsoft Store assets (Partner Center)

| Asset | Spec | Status |
|-------|------|--------|
| Store logo | 300×300 PNG | ✅ `microsoft/assets/store-logo-300.png` (+ 512, 1024) |
| App screenshots | ≥ 1, 1366×768 or larger PNG (up to 10) | ⛔ Not captured — needs the running app (see below) |
| Promotional images (optional) | per Partner Center sizes | ⛔ Optional |

### Regenerating the logos

Rendered from `build/icon.svg` (the source of truth) with `rsvg-convert`:

```bash
for s in 300 512 1024; do
  rsvg-convert -w $s -h $s build/icon.svg -o store-listing/microsoft/assets/store-logo-$s.png
done
```

The MSIX itself already carries the tile/logo assets electron-builder generates
from `build/icon.ico` + the `backgroundColor` (`#0B1220`) in `package.json`
`build.appx`.

### Suggested screenshots (tell a story in order)

1. Query editor with a result grid (the core loop)
2. An entity-relationship (ER) diagram of a schema
3. The AI assistant writing/explaining a query
4. A chart built from query results
5. Browsing a non-SQL store (Redis keys or Mongo documents)

Capture on a clean profile with the dark theme, a seeded demo database (see
`scripts/test-dbs.sh`), and no personal connection details visible.

## To do

- [x] Export a 300×300 store logo PNG
- [ ] Capture the screenshot set above
- [ ] (Optional) design promotional/hero images
