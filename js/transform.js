/**
 * 10-Point Thin Plate Spline (TPS) Coordinate Reference System
 * Maps 2D Image Pixels (x, y) <--> WGS84 Geographic (Lon, Lat)
 * Provides local rubber-sheeting so adjusting one pin does not warp distant borders.
 */

export const INDIA_ANCHORS = {
  north:  { lon: 76.78, lat: 35.50, label: 'N',  name: 'Kashmir / Siachen',                color: '#ef4444' },
  south:  { lon: 77.55, lat: 8.08,  label: 'S',  name: 'Kanyakumari',                      color: '#10b981' },
  west:   { lon: 68.18, lat: 23.71, label: 'W',  name: 'Gujarat (Ghuar Mota)',             color: '#3b82f6' },
  east:   { lon: 97.40, lat: 28.01, label: 'E',  name: 'Arunachal (Kibithu)',              color: '#f59e0b' },
  mizo:   { lon: 92.83, lat: 21.95, label: 'MZ', name: 'Mizoram Southern Tip',            color: '#ec4899' },
  raj:    { lon: 73.88, lat: 30.12, label: 'RJ', name: 'Rajasthan Panhandle Apex',        color: '#8b5cf6' },
  chil:   { lon: 85.45, lat: 19.75, label: 'CH', name: 'Chilika Lake Spit',               color: '#06b6d4' },
  sikkim: { lon: 88.63, lat: 28.13, label: 'SK', name: 'Sikkim Northern Apex',            color: '#14b8a6' },
  mumbai: { lon: 72.82, lat: 18.96, label: 'MB', name: 'Mumbai Coast / Salsette',         color: '#f97316' },
  uk:     { lon: 81.00, lat: 30.22, label: 'UK', name: 'Uttarakhand (Lipulekh Corner)',   color: '#a855f7' }
};

export class GeoTransform {
  constructor() {
    this.isCalibrated = false;
    this.forwardModel = null; // Pixel -> Geo
    this.inverseModel = null; // Geo -> Pixel
  }

  calibrate(pins) {
    const srcPoints = [];
    const dstPoints = [];

    for (const key in INDIA_ANCHORS) {
      if (pins[key]) {
        srcPoints.push([pins[key].x, pins[key].y]);
        dstPoints.push([INDIA_ANCHORS[key].lon, INDIA_ANCHORS[key].lat]);
      }
    }

    if (srcPoints.length < 4) return;

    this.forwardModel = this.buildTpsModel(srcPoints, dstPoints);
    this.inverseModel = this.buildTpsModel(dstPoints, srcPoints);
    this.isCalibrated = true;
  }

  pixelToGeo(px, py) {
    if (!this.forwardModel) return [px, py];
    return this.evaluateTps(this.forwardModel, px, py);
  }

  geoToPixel(lon, lat) {
    if (!this.inverseModel) return { x: 0, y: 0 };
    const res = this.evaluateTps(this.inverseModel, lon, lat);
    return { x: res[0], y: res[1] };
  }

  // TPS Kernel: U(r) = r^2 * ln(r)
  kernel(r2) {
    if (r2 <= 1e-9) return 0;
    return 0.5 * r2 * Math.log(r2);
  }

  buildTpsModel(src, dst) {
    const N = src.length;
    const dim = N + 3;
    const L = Array.from({ length: dim }, () => new Float64Array(dim));

    // Construct TPS matrix L
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        const dx = src[i][0] - src[j][0];
        const dy = src[i][1] - src[j][1];
        const val = this.kernel(dx * dx + dy * dy);
        L[i][j] = val;
        L[j][i] = val;
      }
      L[i][N] = 1;
      L[i][N + 1] = src[i][0];
      L[i][N + 2] = src[i][1];

      L[N][i] = 1;
      L[N + 1][i] = src[i][0];
      L[N + 2][i] = src[i][1];
    }

    // Solve for X and Y components
    const Yx = new Float64Array(dim);
    const Yy = new Float64Array(dim);
    for (let i = 0; i < N; i++) {
      Yx[i] = dst[i][0];
      Yy[i] = dst[i][1];
    }

    const Wx = this.solveLinearSystem(L, Yx);
    const Wy = this.solveLinearSystem(L, Yy);

    return { src, Wx, Wy };
  }

  evaluateTps(model, x, y) {
    const { src, Wx, Wy } = model;
    const N = src.length;
    let outX = Wx[N] + Wx[N + 1] * x + Wx[N + 2] * y;
    let outY = Wy[N] + Wy[N + 1] * x + Wy[N + 2] * y;

    for (let i = 0; i < N; i++) {
      const dx = x - src[i][0];
      const dy = y - src[i][1];
      const u = this.kernel(dx * dx + dy * dy);
      outX += Wx[i] * u;
      outY += Wy[i] * u;
    }

    return [outX, outY];
  }

  solveLinearSystem(A_in, b_in) {
    const n = b_in.length;
    const A = A_in.map(row => Float64Array.from(row));
    const b = Float64Array.from(b_in);

    for (let i = 0; i < n; i++) {
      let maxRow = i;
      for (let k = i + 1; k < n; k++) {
        if (Math.abs(A[k][i]) > Math.abs(A[maxRow][i])) maxRow = k;
      }
      if (maxRow !== i) {
        const tempRow = A[i]; A[i] = A[maxRow]; A[maxRow] = tempRow;
        const tempB = b[i]; b[i] = b[maxRow]; b[maxRow] = tempB;
      }

      const pivot = A[i][i];
      if (Math.abs(pivot) < 1e-12) continue;

      for (let j = i; j < n; j++) A[i][j] /= pivot;
      b[i] /= pivot;

      for (let k = 0; k < n; k++) {
        if (k !== i) {
          const factor = A[k][i];
          for (let j = i; j < n; j++) A[k][j] -= factor * A[i][j];
          b[k] -= factor * b[i];
        }
      }
    }
    return b;
  }
}