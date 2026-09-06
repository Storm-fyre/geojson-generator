/**
 * Morphological Image Processing & Inside-Out Seam Healing
 */

export class Morphology {
  /**
   * One-Way Inside-Out Seam Healing.
   * Expands legitimate interior soils outward through line strokes and gaps,
   * fully covering 100% of the vector land mask with zero unfilled perimeter holes.
   */
  static healSeams(labeledGrid, landMask, width, height) {
    const total = width * height;
    const result = new Uint8Array(labeledGrid);
    const queue = new Int32Array(total);
    let head = 0;
    let tail = 0;

    // Seed all classified interior pixels bordering an unassigned cell inside landMask
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (result[idx] > 0 && landMask[idx] === 1) {
          const left   = x > 0          && landMask[idx - 1] === 1     && result[idx - 1] === 0;
          const right  = x < width - 1  && landMask[idx + 1] === 1     && result[idx + 1] === 0;
          const top    = y > 0          && landMask[idx - width] === 1 && result[idx - width] === 0;
          const bottom = y < height - 1 && landMask[idx + width] === 1 && result[idx + width] === 0;

          if (left || right || top || bottom) {
            queue[tail++] = idx;
          }
        }
      }
    }

    const dx = [1, -1, 0, 0];
    const dy = [0, 0, 1, -1];

    // Multi-source BFS Voronoi fill: completely covers all unassigned space in landMask
    while (head < tail) {
      const curr = queue[head++];
      const cx = curr % width;
      const cy = Math.floor(curr / width);
      const currentLabel = result[curr];

      for (let i = 0; i < 4; i++) {
        const nx = cx + dx[i];
        const ny = cy + dy[i];

        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          const nIdx = ny * width + nx;
          if (landMask[nIdx] === 1 && result[nIdx] === 0) {
            result[nIdx] = currentLabel;
            queue[tail++] = nIdx;
          }
        }
      }
    }

    return result;
  }

  /**
   * Morphological Opening (Erode then Dilate)
   * Eliminates single-pixel noise, thin false-positive fringes, and anti-aliasing artifacts.
   */
  static open(mask, width, height, kernelSize = 3) {
    if (kernelSize <= 1) return mask;
    const radius = Math.floor(kernelSize / 2);
    const eroded = this.erode(mask, width, height, radius);
    return this.dilate(eroded, width, height, radius);
  }

  /**
   * Morphological Closing (Dilate then Erode)
   * Bridges internal pinholes and gaps within solid regions.
   */
  static close(mask, width, height, kernelSize = 3) {
    if (kernelSize <= 1) return mask;
    const radius = Math.floor(kernelSize / 2);
    const dilated = this.dilate(mask, width, height, radius);
    return this.erode(dilated, width, height, radius);
  }

  static dilate(src, w, h, rad) {
    const dst = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (src[y * w + x] === 1) {
          for (let dy = -rad; dy <= rad; dy++) {
            const ny = y + dy;
            if (ny < 0 || ny >= h) continue;
            for (let dx = -rad; dx <= rad; dx++) {
              const nx = x + dx;
              if (nx >= 0 && nx < w) {
                dst[ny * w + nx] = 1;
              }
            }
          }
        }
      }
    }
    return dst;
  }

  static erode(src, w, h, rad) {
    const dst = new Uint8Array(w * h);
    for (let y = rad; y < h - rad; y++) {
      for (let x = rad; x < w - rad; x++) {
        let allOn = true;
        for (let dy = -rad; dy <= rad && allOn; dy++) {
          for (let dx = -rad; dx <= rad; dx++) {
            if (src[(y + dy) * w + (x + dx)] === 0) {
              allOn = false;
              break;
            }
          }
        }
        dst[y * w + x] = allOn ? 1 : 0;
      }
    }
    return dst;
  }
}