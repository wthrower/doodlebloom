# doodlebloom

Color-by-number puzzle game. React 19 + Vite + TypeScript.

## Icons

**Use [Lucide React](https://lucide.dev)** (`lucide-react` package).

```tsx
import { Maximize2, Minimize2, ScanSearch } from 'lucide-react'
<Maximize2 size={15} />
```

MIT license, tree-shakeable, ~1000 icons. Browse at lucide.dev.

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
