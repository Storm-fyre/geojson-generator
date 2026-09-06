/**
 * Color Segmentation, Boundary Stroke Filtering, and Anti-Aliasing Isolation
 */

export class ColorExtractor {
  static hexToRgb(hex) {
    const clean = hex.replace('#', '');
    const bigint = parseInt(clean, 16);
    return {
      r: (bigint >> 16) & 255,
      g: (bigint >> 8) & 255,
      b: bigint & 255
    };
  }

  /**
   * Identifies dark line strokes (international borders, state lines, rivers).
   * Automatically dilates the detected lines by `dilateRadius` pixels to 
   * swallow anti-aliased edge halos and prevent them from seeding as soil.
   */
  static extractLineStrokeMask(imageData, threshold = 150, dilateRadius = 2) {
    const data = imageData.data;
    const w = imageData.width;
    const h = imageData.height;
    const total = w * h;
    const rawLine = new Uint8Array(total);

    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];

      // Opaque dark ink has low combined luminance
      if (a >= 128 && (r + g + b < threshold)) {
        rawLine[p] = 1;
      }
    }

    if (dilateRadius <= 0) return rawLine;

    // Dilate line strokes to encapsulate surrounding grey anti-aliasing gradients
    const dilated = new Uint8Array(total);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (rawLine[y * w + x] === 1) {
          for (let dy = -dilateRadius; dy <= dilateRadius; dy++) {
            const ny = y + dy;
            if (ny < 0 || ny >= h) continue;
            for (let dx = -dilateRadius; dx <= dilateRadius; dx++) {
              const nx = x + dx;
              if (nx >= 0 && nx < w) {
                dilated[ny * w + nx] = 1;
              }
            }
          }
        }
      }
    }
    return dilated;
  }

  /**
   * Generates a binary mask for a target soil category.
   * - Filters out white/near-white paper background outside map borders.
   * - Enforces strict luminance and saturation constraints on Black Soil (#424242)
   *   so boundary stroke ink is never misidentified as Black Soil.
   */
  static extractColorMask(imageData, targetHex, tolerance, isBlackSoil = false) {
    const target = this.hexToRgb(targetHex);
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;
    const mask = new Uint8Array(width * height);

    const tolSq = tolerance * tolerance * 3;

    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];

      if (a < 128) continue;

      // Reject empty white map margin/canvas
      if (r > 245 && g > 245 && b > 245) continue;

      const sum = r + g + b;

      // Black Soil (#424242) protection:
      // True black soil is a mid-tone charcoal gray (sum ~ 160-230).
      // Reject pure black/dark ink (sum < 150) and saturated colored pixels.
      if (isBlackSoil) {
        if (sum < 150) continue;
        const chromaDiff = Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b));
        if (chromaDiff > 35) continue;
      }

      const dr = r - target.r;
      const dg = g - target.g;
      const db = b - target.b;

      const distSq = (dr * dr * 2) + (dg * dg * 4) + (db * db * 3);
      if (distSq <= tolSq) {
        mask[p] = 1;
      }
    }

    return mask;
  }
}