/*
 * RGB → YUV 4:2:0 (I420) with BT.709 coefficients in limited range (Y 16–235, UV 16–240):
 * what phones, TVs and every player assume for HD H.264, and what the MP4 declares.
 * Doing it here instead of leaving it to an encoder means the colors are exact and the
 * file says precisely how they were stored.
 */

const KR = 0.2126
const KB = 0.0722
const KG = 1 - KR - KB
const Y_SCALE = 219 / 255
const C_SCALE = 224 / 255

/** Fixed point with 16 fractional bits. */
const fixed = (value: number) => Math.round(value * 65536)
const HALF = 32768

const YR = fixed(KR * Y_SCALE)
const YG = fixed(KG * Y_SCALE)
const YB = fixed(KB * Y_SCALE)
const UR = fixed((-KR / (2 * (1 - KB))) * C_SCALE)
const UG = fixed((-KG / (2 * (1 - KB))) * C_SCALE)
const UB = fixed(0.5 * C_SCALE)
const VR = fixed(0.5 * C_SCALE)
const VG = fixed((-KG / (2 * (1 - KR))) * C_SCALE)
const VB = fixed((-KB / (2 * (1 - KR))) * C_SCALE)

/** Bytes of an I420 frame: full-size Y plane, then quarter-size U and V planes. */
export const i420Size = (width: number, height: number): number => width * height + 2 * (width / 2) * (height / 2)

/**
 * Converts an RGBA frame (alpha ignored) to I420 in `out`. Width and height must be even.
 * `bottomUp` flips it, for pixels read from WebGL (first row = bottom of the image).
 */
export function rgbaToI420(rgba: Uint8Array, width: number, height: number, out: Uint8Array, bottomUp = false): void {
  const chromaWidth = width / 2
  const uPlane = width * height
  const vPlane = uPlane + chromaWidth * (height / 2)
  const stride = width * 4
  for (let y = 0; y < height; y += 2) {
    const row0 = (bottomUp ? height - 1 - y : y) * stride
    const row1 = (bottomUp ? height - 2 - y : y + 1) * stride
    const yOut0 = y * width
    const yOut1 = yOut0 + width
    const cOut = (y / 2) * chromaWidth
    for (let x = 0; x < width; x += 2) {
      const a = row0 + x * 4
      const b = a + 4
      const c = row1 + x * 4
      const d = c + 4
      const r0 = rgba[a], g0 = rgba[a + 1], b0 = rgba[a + 2]
      const r1 = rgba[b], g1 = rgba[b + 1], b1 = rgba[b + 2]
      const r2 = rgba[c], g2 = rgba[c + 1], b2 = rgba[c + 2]
      const r3 = rgba[d], g3 = rgba[d + 1], b3 = rgba[d + 2]
      out[yOut0 + x] = 16 + ((YR * r0 + YG * g0 + YB * b0 + HALF) >> 16)
      out[yOut0 + x + 1] = 16 + ((YR * r1 + YG * g1 + YB * b1 + HALF) >> 16)
      out[yOut1 + x] = 16 + ((YR * r2 + YG * g2 + YB * b2 + HALF) >> 16)
      out[yOut1 + x + 1] = 16 + ((YR * r3 + YG * g3 + YB * b3 + HALF) >> 16)
      // Chroma from the average color of the 2×2 block (sums, hence the extra >> 2).
      const r = r0 + r1 + r2 + r3
      const g = g0 + g1 + g2 + g3
      const bl = b0 + b1 + b2 + b3
      const i = cOut + x / 2
      out[uPlane + i] = 128 + ((UR * r + UG * g + UB * bl + 4 * HALF) >> 18)
      out[vPlane + i] = 128 + ((VR * r + VG * g + VB * bl + 4 * HALF) >> 18)
    }
  }
}
