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

  const outData = out.data
  const win = (2 * radius + 1) * (2 * radius + 1)
  const rArr = new Uint8Array(win)
  const gArr = new Uint8Array(win)
  const bArr = new Uint8Array(win)
  const mid = win >> 1

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let n = 0
      for (let dy = -radius; dy <= radius; dy++) {
        let sy = y + dy
        if (sy < 0) sy = 0
        else if (sy >= height) sy = height - 1
        const row = sy * width
        for (let dx = -radius; dx <= radius; dx++) {
          let sx = x + dx
          if (sx < 0) sx = 0
          else if (sx >= width) sx = width - 1
          const si = (row + sx) * 4
          rArr[n] = data[si]
          gArr[n] = data[si + 1]
          bArr[n] = data[si + 2]
          n++
        }
      }
      const di = (y * width + x) * 4
      outData[di] = quickSelect(rArr, n, mid)
      outData[di + 1] = quickSelect(gArr, n, mid)
      outData[di + 2] = quickSelect(bArr, n, mid)
      // alpha (di + 3) already carried over from the source copy
    }
  }

  return out
}

/** In-place Hoare quickselect: returns the k-th smallest of a[0..n). Mutates a
 *  (fine -- the window buffers are refilled for every pixel). */
function quickSelect(a: Uint8Array, n: number, k: number): number {
  let lo = 0
  let hi = n - 1
  while (lo < hi) {
    const pivot = a[(lo + hi) >> 1]
    let i = lo
    let j = hi
    while (i <= j) {
      while (a[i] < pivot) i++
      while (a[j] > pivot) j--
      if (i <= j) {
        const t = a[i]; a[i] = a[j]; a[j] = t
        i++; j--
      }
    }
    if (k <= j) hi = j
    else if (k >= i) lo = i
    else break
  }
  return a[k]
}
