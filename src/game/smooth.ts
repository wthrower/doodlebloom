/**
 * Edge-preserving median filter on the RGB channels of an ImageData.
 *
 * Applied before color quantization/assignment to remove sub-feature texture
 * (foliage, fabric weave, JPEG speckle) so the segmentation latches onto major
 * shapes instead of fragmenting into pointless tiny regions.
 *
 * Why median, not gaussian: a gaussian blur averages across edges, turning a
 * sharp A|B boundary into an A->B gradient ramp. Quantization then slices that
 * ramp into intermediate palette colors, producing thin sliver regions that
 * trace every former boundary. A median filter's output is always an actual
 * neighboring pixel value, so it never invents an intermediate color -- at an
 * A|B edge the window is bimodal and the median lands on A or B. The edge shifts
 * by at most `radius` px but stays sharp, and no sliver is created.
 *
 * Alpha is copied through unchanged (blurring alpha would create semi-transparent
 * fringes that shift the `alpha > 128` pixel filter in quantize.ts).
 *
 * Returns a new ImageData; the source is not mutated. radius < 1 returns a copy.
 */
export function medianFilterRGB(src: ImageData, radius: number): ImageData {
  const { width, height, data } = src
  const out = new ImageData(new Uint8ClampedArray(data), width, height)
  if (radius < 1) return out

  // Huang's sliding-histogram median: per row, keep 256-bin histograms of the
  // window and slide one column at a time (remove leaving column, add entering
  // column), nudging the median pointer instead of re-sorting per pixel.
  // Windows are edge-clamped (duplicated border pixels) so they are always
  // full-size, and the median rank is win>>1 — identical output to a
  // per-window sort.
  const outData = out.data
  const side = 2 * radius + 1
  const mid = (side * side) >> 1
  const histR = new Uint16Array(256)
  const histG = new Uint16Array(256)
  const histB = new Uint16Array(256)
  const rowOff = new Int32Array(side)

  const clampX = (x: number) => (x < 0 ? 0 : x >= width ? width - 1 : x)

  for (let y = 0; y < height; y++) {
    for (let dy = -radius; dy <= radius; dy++) {
      let sy = y + dy
      if (sy < 0) sy = 0
      else if (sy >= height) sy = height - 1
      rowOff[dy + radius] = sy * width
    }

    // Build histograms for the window at x = 0.
    histR.fill(0); histG.fill(0); histB.fill(0)
    for (let dx = -radius; dx <= radius; dx++) {
      const sx = clampX(dx)
      for (let k = 0; k < side; k++) {
        const si = (rowOff[k] + sx) * 4
        histR[data[si]]++
        histG[data[si + 1]]++
        histB[data[si + 2]]++
      }
    }

    // Initial medians: smallest value whose cumulative count exceeds mid.
    // ltX = number of window samples strictly below medX (Huang's invariant:
    // ltX <= mid < ltX + histX[medX]).
    let medR = 0, ltR = 0
    while (ltR + histR[medR] <= mid) { ltR += histR[medR]; medR++ }
    let medG = 0, ltG = 0
    while (ltG + histG[medG] <= mid) { ltG += histG[medG]; medG++ }
    let medB = 0, ltB = 0
    while (ltB + histB[medB] <= mid) { ltB += histB[medB]; medB++ }

    for (let x = 0; x < width; x++) {
      const di = (y * width + x) * 4
      outData[di] = medR
      outData[di + 1] = medG
      outData[di + 2] = medB
      // alpha (di + 3) already carried over from the source copy
      if (x === width - 1) break

      // Slide right: drop column x-radius, add column x+1+radius (clamped).
      const sxOut = clampX(x - radius)
      const sxIn = clampX(x + 1 + radius)
      for (let k = 0; k < side; k++) {
        const ro = rowOff[k]
        const so = (ro + sxOut) * 4
        const si = (ro + sxIn) * 4
        const rOut = data[so], rIn = data[si]
        histR[rOut]--; if (rOut < medR) ltR--
        histR[rIn]++;  if (rIn < medR) ltR++
        const gOut = data[so + 1], gIn = data[si + 1]
        histG[gOut]--; if (gOut < medG) ltG--
        histG[gIn]++;  if (gIn < medG) ltG++
        const bOut = data[so + 2], bIn = data[si + 2]
        histB[bOut]--; if (bOut < medB) ltB--
        histB[bIn]++;  if (bIn < medB) ltB++
      }

      // Restore the invariant by walking the median pointer.
      while (ltR > mid) { medR--; ltR -= histR[medR] }
      while (ltR + histR[medR] <= mid) { ltR += histR[medR]; medR++ }
      while (ltG > mid) { medG--; ltG -= histG[medG] }
      while (ltG + histG[medG] <= mid) { ltG += histG[medG]; medG++ }
      while (ltB > mid) { medB--; ltB -= histB[medB] }
      while (ltB + histB[medB] <= mid) { ltB += histB[medB]; medB++ }
    }
  }

  return out
}
