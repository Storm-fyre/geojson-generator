/**
 * Contour Extraction, Douglas-Peucker Smoothing, Topological Snapping,
 * and High-Precision Geographic Island Simplification (matching Python RDP).
 */

export class Vectorizer {
  /* -------------------------------------------------------------
     Raster Pixel Contour Extraction & Simplification
     ------------------------------------------------------------- */
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

  static snapSharedVertices(layerCollection, snapRadius = 1.6) {
    const spatialGrid = new Map();
    const cell = snapRadius;

    function hash(x, y) {
      return `${Math.round(x / cell)},${Math.round(y / cell)}`;
    }

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
        if (ring.length > 0) {
          ring[ring.length - 1].x = ring[0].x;
          ring[ring.length - 1].y = ring[0].y;
        }
      }
    }
  }

  /* -------------------------------------------------------------
     Direct Geographic Island Extraction & Python-Matching RDP Simplification
     ------------------------------------------------------------- */
  static pointLineDistanceGeo(pt, start, end) {
    const [x, y] = pt;
    const [x1, y1] = start;
    const [x2, y2] = end;
    const dx = x2 - x1;
    const dy = y2 - y1;
    if (dx === 0 && dy === 0) return Math.hypot(x - x1, y - y1);
    return Math.abs(dy * x - dx * y + x2 * y1 - y2 * x1) / Math.hypot(dx, dy);
  }

  static rdpGeo(points, epsilon) {
    if (points.length < 3) return points;
    let dmax = 0.0;
    let index = 0;
    const end = points.length - 1;

    for (let i = 1; i < end; i++) {
      const d = this.pointLineDistanceGeo(points[i], points[0], points[end]);
      if (d > dmax) {
        index = i;
        dmax = d;
      }
    }

    if (dmax > epsilon) {
      const rec1 = this.rdpGeo(points.slice(0, index + 1), epsilon);
      const rec2 = this.rdpGeo(points.slice(index), epsilon);
      return rec1.slice(0, -1).concat(rec2);
    } else {
      return [points[0], points[end]];
    }
  }

  /**
   * Matches Python merge_islands.py simplify_ring logic exactly:
   * Rounds coordinates, splits closed loops at farthest point before RDP,
   * deduplicates, and guarantees valid closed LinearRings.
   */
  static simplifyGeoRing(ring, epsilon = 0.005, precision = 2) {
    const deduped = [];
    for (const pt of ring) {
      const rounded = [
        parseFloat(pt[0].toFixed(precision)),
        parseFloat(pt[1].toFixed(precision))
      ];
      if (deduped.length === 0 || deduped[deduped.length - 1][0] !== rounded[0] || deduped[deduped.length - 1][1] !== rounded[1]) {
        deduped.push(rounded);
      }
    }

    if (deduped.length < 4) return null;

    const start = deduped[0];
    let farthestIdx = 0;
    let maxD = 0.0;
    for (let i = 0; i < deduped.length - 1; i++) {
      const d = Math.hypot(deduped[i][0] - start[0], deduped[i][1] - start[1]);
      if (d > maxD) {
        maxD = d;
        farthestIdx = i;
      }
    }

    if (farthestIdx === 0 || farthestIdx === deduped.length - 1) {
      farthestIdx = Math.floor(deduped.length / 2);
    }

    const arc1 = this.rdpGeo(deduped.slice(0, farthestIdx + 1), epsilon);
    const arc2 = this.rdpGeo(deduped.slice(farthestIdx), epsilon);
    const simplified = arc1.slice(0, -1).concat(arc2);

    const finalRing = [];
    for (const p of simplified) {
      const rounded = [
        parseFloat(p[0].toFixed(precision)),
        parseFloat(p[1].toFixed(precision))
      ];
      if (finalRing.length === 0 || finalRing[finalRing.length - 1][0] !== rounded[0] || finalRing[finalRing.length - 1][1] !== rounded[1]) {
        finalRing.push(rounded);
      }
    }

    if (finalRing.length > 1) {
      const f = finalRing[0];
      const l = finalRing[finalRing.length - 1];
      if (f[0] !== l[0] || f[1] !== l[1]) {
        finalRing.push([f[0], f[1]]);
      }
    }

    return finalRing.length >= 4 ? finalRing : null;
  }

  /**
   * Extracts and simplifies polygons for Andaman, Nicobar, or Lakshadweep
   * directly from india.geojson using the Ten Degree Channel (10°N) divide.
   */
  static extractIslandPolygons(indiaGeojson, targetGroup) {
    if (!indiaGeojson || !indiaGeojson.features) return [];

    let rawPolys = [];

    for (const feature of indiaGeojson.features) {
      const props = feature.properties || {};
      const featId = (props.id || '').toUpperCase();
      const featName = (props.name || '').toLowerCase();
      const geom = feature.geometry;
      if (!geom) continue;

      const isLakshadweep = (featId === 'INLD' || featName.includes('lakshadweep'));
      const isAndamanNicobar = (featId === 'INAN' || featName.includes('andaman'));

      let rings = [];
      if (geom.type === 'Polygon') {
        rings = [geom.coordinates];
      } else if (geom.type === 'MultiPolygon') {
        rings = geom.coordinates;
      }

      if (targetGroup === 'lakshadweep' && isLakshadweep) {
        rawPolys.push(...rings);
      } else if ((targetGroup === 'andaman' || targetGroup === 'nicobar') && isAndamanNicobar) {
        for (const poly of rings) {
          // Check latitude using exterior ring vertex:
          // Ten Degree Channel (10°N) cleanly splits Andaman (North >= 10°N) from Nicobar (South < 10°N)
          const sampleLat = poly[0] && poly[0][0] ? poly[0][0][1] : 0;
          if (targetGroup === 'andaman' && sampleLat >= 10.0) {
            rawPolys.push(poly);
          } else if (targetGroup === 'nicobar' && sampleLat < 10.0) {
            rawPolys.push(poly);
          }
        }
      }
    }

    // Simplify each polygon ring with Python-matching settings
    const simplifiedPolys = [];
    for (const poly of rawPolys) {
      const simplifiedRings = [];
      for (const ring of poly) {
        const sRing = this.simplifyGeoRing(ring, 0.005, 2);
        if (sRing) {
          simplifiedRings.push(sRing);
        }
      }
      if (simplifiedRings.length > 0) {
        simplifiedPolys.push(simplifiedRings);
      }
    }

    return simplifiedPolys;
  }
}