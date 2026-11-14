// Show which search categories stock images fall under, so a promotion can
// check that new images are findable (see the stock-images skill).
//
// Usage: node scripts/search-tags.ts <name> [name...]
//        node scripts/search-tags.ts --untagged      # images in no category
//
// Plain node runs this: Node 22.18+ strips TypeScript types, and
// searchSynonyms.ts has no imports.
import { readdirSync } from 'node:fs'
import { categoriesForImage } from '../src/game/searchSynonyms.ts'

const args = process.argv.slice(2)
const thumbs = new URL('../public/images/thumbs/', import.meta.url)
const all = readdirSync(thumbs).filter(f => f.endsWith('.webp')).map(f => f.slice(0, -5))

if (args[0] === '--untagged') {
  const none = all.filter(id => categoriesForImage(id).length === 0)
  console.log(none.join('\n'))
  console.error(`${none.length} of ${all.length} images are in no search category`)
} else if (args.length) {
  for (const id of args) {
    const cats = categoriesForImage(id)
    console.log(`${id.padEnd(40)} ${cats.length ? cats.join(', ') : '(none)'}`)
  }
} else {
  console.error('Usage: node scripts/search-tags.ts <name> [name...] | --untagged')
  process.exit(1)
}
