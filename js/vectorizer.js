/**
 * Contour Extraction, Douglas-Peucker Smoothing & Topological Shared-Edge Vertex Snapping
 */

export class Vectorizer {
  static traceContours(mask, width, height, minArea = 15) {
    const visited = new Uint8Array(width * height);
    const contours = [];

    const dx = [1, 1, 0, -1, -1, -1, 0, 1];
    const dy = [0, 1, 1, 1, 0, -1, -1, -1];

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        if (mask[idx] === 1 && visited[idx] === 0) {
          if (mask[y * width + (x - 1)] === 0) {
            const ring = this.mooreTrace(mask, visited, width, height, x, y, dx, dy);
            if (ring && ring.length >= 4 && this.polygonArea(ring) >= minArea) {
              contours.push(ring);
            }
          }
        }
      }
    }

    return contours;
  }

  static mooreTrace(mask, visited, w, h, startX, startY, dx, dy) {
    const points = [];
    let curX = startX;
    let curY = startY;
    let checkDir = 7;

    points.push({ x: curX, y: curY });
    visited[curY * w + curX] = 1;

    let iterations = 0;
    const maxIterations = 35000;

    while (iterations++ < maxIterations) {
      let foundNext = false;
      let nextDir = (checkDir + 6) % 8;

      for (let i = 0; i < 8; i++) {
        const d = (nextDir + i) % 8;
        const nx = curX + dx[d];
        const ny = curY + dy[d];

        if (nx >= 0 && nx < w && ny >= 0 && ny < h && mask[ny * w + nx] === 1) {
          curX = nx;
          curY = ny;
          checkDir = d;
          visited[curY * w + curX] = 1;
          points.push({ x: curX, y: curY });
          foundNext = true;
          break;
        }
      }

      if (!foundNext || (curX === startX && curY === startY)) break;
    }

    if (points.length > 0) {
      const first = points[0];
      const last = points[points.length - 1];
      if (first.x !== last.x || first.y !== last.y) {
        points.push({ x: first.x, y: first.y });
      }
    }

    return points;
  }

  static polygonArea(points) {
    let area = 0;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      area += (points[j].x + points[i].x) * (points[j].y - points[i].y);
    }
    return Math.abs(area / 2);
  }

  static simplify(points, tolerance = 1.0) {
    if (points.length <= 3) return points;

    let maxDist = 0;
    let index = 0;
    const end = points.length - 1;

    for (let i = 1; i < end; i++) {
      const dist = this.perpendicularDistance(points[i], points[0], points[end]);
      if (dist > maxDist) {
        maxDist = dist;
        index = i;
      }
    }

    if (maxDist > tolerance) {
      const left = this.simplify(points.slice(0, index + 1), tolerance);
      const right = this.simplify(points.slice(index), tolerance);
      return left.slice(0, left.length - 1).concat(right);
    } else {
      return [points[0], points[end]];
    }
  }

  static perpendicularDistance(pt, lineStart, lineEnd) {
    const dx = lineEnd.x - lineStart.x;
    const dy = lineEnd.y - lineStart.y;
    const mag = Math.hypot(dx, dy);
    if (mag === 0) return Math.hypot(pt.x - lineStart.x, pt.y - lineStart.y);
    return Math.abs(dy * pt.x - dx * pt.y + lineEnd.x * lineStart.y - lineEnd.y * lineStart.x) / mag;
  }

  /**
   * Topological Shared-Edge Vertex Snapping
   * Forces adjacent polygon boundaries within snapRadius to share identical coordinates.
   * Completely eliminates internal hairline cracks and slivers.
   */
  static snapSharedVertices(layerCollection, snapRadius = 1.6) {
    const spatialGrid = new Map();
    const cell = snapRadius;

    function hash(x, y) {
      return `${Math.round(x / cell)},${Math.round(y / cell)}`;
    }

    // Step 1: Index anchor coordinates
    for (const item of layerCollection) {
      for (const ring of item.rings) {
        for (const pt of ring) {
          const k = hash(pt.x, pt.y);
          if (!spatialGrid.has(k)) {
            spatialGrid.set(k, { x: pt.x, y: pt.y });
          }
        }
      }
    }

    // Step 2: Lock touching vertices to the identical shared grid point
    for (const item of layerCollection) {
      for (const ring of item.rings) {
        for (let i = 0; i < ring.length; i++) {
          const k = hash(ring[i].x, ring[i].y);
          const anchor = spatialGrid.get(k);
          if (anchor) {
            ring[i].x = anchor.x;
            ring[i].y = anchor.y;
          }
        }
        // Ensure closed ring
        if (ring.length > 0) {
          ring[ring.length - 1].x = ring[0].x;
          ring[ring.length - 1].y = ring[0].y;
        }
      }
    }
  }
}