# doodlebloom

Color-by-number puzzle game. React 19 + Vite + TypeScript.

## Icons

**Use [Lucide React](https://lucide.dev)** (`lucide-react` package).

```tsx
import { Maximize2, Minimize2, ScanSearch } from 'lucide-react'
<Maximize2 size={15} />
```

MIT license, tree-shakeable, ~1000 icons. Browse at lucide.dev.

## Stock Images

Use the `/stock-images` skill. Do not call `~/src/leo/cli.py` directly and do
not use `/gallery-iterate` -- both skip the style suffix and the thumbnail.

```bash
scripts/gen-stock.sh [--no-style] [--stage <dir>] <name> "<prompt>"
scripts/promote-stock.sh <stage-dir> [name...]
scripts/gen-batch.sh              # batch, reads tmp/gen-jobs.sh
```

`gen-stock.sh` generates at 1024x1536 and appends the shared style suffix from
`prompts/style-suffix.txt` -- the single source of truth, also imported by
`src/hooks/useOpenAI.ts` for in-app generation. Edit that file and both paths
change together.

The suffix asks for flat cel-shaded art with crisp unbroken boundaries and no
region too small to fill -- what the region tracer needs to produce a good
coloring-book page. `--no-style` omits it for prompts that dictate a competing
look (stained glass, art deco, mosaic, folk art).

**The thumbnail is the registration.** `StartScreen.tsx` globs
`public/images/thumbs/*.webp`; there is no manifest and we do not want one. A
PNG without a thumb is invisible to the game but still bloats `dist/`. Always
promote with `promote-stock.sh`, never a bare `cp`.

Avoid filenames that ad blockers filter -- `jellyfish` matched a filter list and
broke the strip (commit `c0e3a6f`, renamed `sea_jellyfish`).

## Typecheck

```bash
npx tsc -b --noEmit
```

Plain `npx tsc --noEmit` is a silent no-op here: `tsconfig.json` is
solution-style (`files: []` + project references), so tsc checks nothing and
exits 0. Build mode (`-b`) follows the references.

## Deploy

```bash
~/src/dev-tools/bin/deploy doodlebloom
```
