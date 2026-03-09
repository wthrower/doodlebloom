// Perceptual color distance in CIE L*a*b* space (ΔE76)

function linearize(c: number): number {
  c /= 255
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

export function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  const rl = linearize(r), gl = linearize(g), bl = linearize(b)
  // Linear RGB → XYZ (D65)
  const x = (rl * 0.4124 + gl * 0.3576 + bl * 0.1805) / 0.95047
  const y =   rl * 0.2126 + gl * 0.7152 + bl * 0.0722
  const z = (rl * 0.0193 + gl * 0.1192 + bl * 0.9505) / 1.08883
  const f = (t: number) => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116
  const fx = f(x), fy = f(y), fz = f(z)
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

/** ΔE76: perceptual distance between two sRGB colors (0–8-bit channels). */
export function colorDist(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  const [L1, a1, b1_] = rgbToLab(r1, g1, b1)
  const [L2, a2, b2_] = rgbToLab(r2, g2, b2)
  const dL = L1 - L2, da = a1 - a2, db = b1_ - b2_
  return Math.sqrt(dL * dL + da * da + db * db)
}

/** Chroma distance: a*b* plane only, ignoring lightness.
 *  Low values mean similar hue/saturation (e.g. gradient bands). */
export function chromaDist(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  const [, a1, b1_] = rgbToLab(r1, g1, b1)
  const [, a2, b2_] = rgbToLab(r2, g2, b2)
  const da = a1 - a2, db = b1_ - b2_
  return Math.sqrt(da * da + db * db)
}

/** Convert CIE L*a*b* back to sRGB (0–255, clamped). */
export function labToRgb(L: number, a: number, b: number): [number, number, number] {
  const fy = (L + 16) / 116
  const fx = a / 500 + fy
  const fz = fy - b / 200
  const finv = (t: number) => t > 0.206893 ? t * t * t : (t - 16 / 116) / 7.787
  const x = finv(fx) * 0.95047
  const y = finv(fy)
  const z = finv(fz) * 1.08883
  // XYZ → linear RGB
  let rl =  3.2406 * x - 1.5372 * y - 0.4986 * z
  let gl = -0.9689 * x + 1.8758 * y + 0.0415 * z
  let bl =  0.0557 * x - 0.2040 * y + 1.0570 * z
  const gamma = (c: number) => c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055
  return [
    Math.max(0, Math.min(255, Math.round(gamma(rl) * 255))),
    Math.max(0, Math.min(255, Math.round(gamma(gl) * 255))),
    Math.max(0, Math.min(255, Math.round(gamma(bl) * 255))),
  ]
}

/** Minimum chroma (saturation) of a color in Lab space. */
export function chroma(r: number, g: number, b: number): number {
  const [, a, b_] = rgbToLab(r, g, b)
  return Math.sqrt(a * a + b_ * b_)
}
