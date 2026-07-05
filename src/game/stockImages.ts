/** Single home for the stock-image URL/filename conventions
 *  (public/images/<file>.png, thumbs in public/images/thumbs/<file>.webp). */

/** Stock file id from an image URL ("…/images/autumn_forest_cel.png" ->
 *  "autumn_forest_cel"), or null for non-stock URLs. */
export function stockIdFromUrl(url: string | null): string | null {
  const m = url?.match(/images\/(.+)\.png$/)
  return m ? m[1] : null
}

/** Human-readable label from a stock file id ("autumn_forest_cel" ->
 *  "Autumn Forest Cel"). */
export function prettyImageLabel(file: string): string {
  return file.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

/** Human-readable name of a stock image from its URL, or null for
 *  non-stock URLs. */
export function prettyStockLabel(url: string | null): string | null {
  const id = stockIdFromUrl(url)
  return id ? prettyImageLabel(id) : null
}
