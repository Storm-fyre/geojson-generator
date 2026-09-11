/**
 * Canvas Viewport, Bounding Box & 10-Point TPS Calibration Pins
 * Features open-center crosshairs with outward-offset floating badges.
 */
import { INDIA_ANCHORS } from './transform.js';

export class MapViewport {
  constructor(canvasId, onTransformChangeCallback, onEyedropperCallback) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    
    this.onTransformChange = onTransformChangeCallback;
    this.onEyedropper = onEyedropperCallback;

    this.image = null;
    this.scale = 1.0;
    this.offsetX = 0;
    this.offsetY = 0;

    this.isPanning = false;
    this.panStartX = 0;
    this.panStartY = 0;

    this.mode = 'navigate';
    this.calibrationMode = 'box';
    
    this.box = { x: 0, y: 0, w: 100, h: 100 };
    this.baseBox = { w: 100, h: 100 };
    this.aspectRatio = 1.0;
    this.boxAction = null;
    this.boxDragStart = { x: 0, y: 0, boxX: 0, boxY: 0, boxW: 0, boxH: 0 };
    this.resizeHandleRadius = 9;

    this.draggedPin = null;
    this.pinRadius = 9; // radius of the floating label badge

    // All 10 Landmark Pins initialized
    this.pins = {};
    for (const key in INDIA_ANCHORS) {
      this.pins[key] = {
        x: 0, y: 0,
        label: INDIA_ANCHORS[key].label,
        color: INDIA_ANCHORS[key].color
      };
    }

    // Relative ratios within India's natural bounding box
    this.pinRatios = {
      north:  { rx: 0.35, ry: 0.00 },
      south:  { rx: 0.42, ry: 1.00 },
      west:   { rx: 0.00, ry: 0.45 },
      east:   { rx: 1.00, ry: 0.28 },
      mizo:   { rx: 0.86, ry: 0.49 },
      raj:    { rx: 0.25, ry: 0.22 },
      chil:   { rx: 0.65, ry: 0.58 },
      sikkim: { rx: 0.70, ry: 0.27 },
      mumbai: { rx: 0.16, ry: 0.60 },
      uk:     { rx: 0.44, ry: 0.19 }
    };

    // Outward offset vectors so badges float into open space instead of covering the vertex
    this.badgeOffsets = {
      north:  { ox: 0,   oy: -22 },
      south:  { ox: 0,   oy:  22 },
      west:   { ox: -22, oy:   0 },
      east:   { ox:  22, oy:   0 },
      mizo:   { ox:  20, oy:  18 },
      raj:    { ox: -20, oy: -18 },
      chil:   { ox:  22, oy:  14 },
      sikkim: { ox:   0, oy: -22 },
      mumbai: { ox: -22, oy:   0 },
      uk:     { ox:  18, oy: -18 }
    };

    this.referenceGeojson = null;
    this.geoTransform = null;
    this.vectorPreview = null;
    this.overlayOpacity = 0.45;
    this.overlayColor = '#00ffff';

    this.initEventListeners();
  }

  setOverlayColor(colorHex) {
    this.overlayColor = colorHex;
    this.render();
  }

  getOverlayFillColor() {
    const hex = this.overlayColor.replace('#', '');
    const bigint = parseInt(hex, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `rgba(${r}, ${g}, ${b}, 0.14)`;
  }

  getBadgeOffset(key) {
    return this.badgeOffsets[key] || { ox: 18, oy: -18 };
  }

  resize() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    this.canvas.width = parent.clientWidth;
    this.canvas.height = parent.clientHeight;
    this.render();
  }

  loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        this.image = img;
        this.fitToScreen();

        const w = img.naturalWidth;
        const h = img.naturalHeight;

        const bw = Math.round(w * 0.72);
        const bh = Math.round(bw * 1.14);
        this.box = {
          x: Math.round((w - bw) / 2),
          y: Math.round(h * 0.05),
          w: bw,
          h: bh
        };
        this.baseBox = { w: bw, h: bh };
        this.aspectRatio = bw / bh;

        this.updatePinsFromBox();
        this.render();
        resolve(img);
      };
      img.onerror = reject;
      img.src = src;
    });
  }

  setReferenceGeojson(geojson, transform) {
    this.referenceGeojson = geojson;
    this.geoTransform = transform;
    this.render();
  }

  updateTransform(transform) {
    this.geoTransform = transform;
    this.render();
  }

  setCalibrationMode(mode) {
    this.calibrationMode = mode;
    if (mode === 'box') {
      this.recalculateBoxFromPins();
    }
    this.render();
  }

  updatePinsFromBox() {
    for (const key in this.pinRatios) {
      if (this.pins[key]) {
        this.pins[key].x = Math.round(this.box.x + this.pinRatios[key].rx * this.box.w);
        this.pins[key].y = Math.round(this.box.y + this.pinRatios[key].ry * this.box.h);
      }
    }
    if (this.onTransformChange) this.onTransformChange(this.pins);
  }

  recalculateBoxFromPins() {
    const xs = Object.values(this.pins).map(p => p.x);
    const ys = Object.values(this.pins).map(p => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    const bw = Math.max(50, maxX - minX);
    const bh = Math.max(50, maxY - minY);

    this.box = { x: minX, y: minY, w: bw, h: bh };
    this.aspectRatio = bw / bh;

    for (const key in this.pins) {
      this.pinRatios[key] = {
        rx: (this.pins[key].x - minX) / bw,
        ry: (this.pins[key].y - minY) / bh
      };
    }
  }

  fitToScreen() {
    if (!this.image) return;
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const iw = this.image.naturalWidth;
    const ih = this.image.naturalHeight;

    this.scale = Math.min((cw - 40) / iw, (ch - 40) / ih, 1.0);
    this.offsetX = (cw - iw * this.scale) / 2;
    this.offsetY = (ch - ih * this.scale) / 2;
    this.render();
  }

  zoom(factor) {
    const prevScale = this.scale;
    this.scale = Math.max(0.1, Math.min(10.0, this.scale * factor));
    const cx = this.canvas.width / 2;
    const cy = this.canvas.height / 2;
    this.offsetX = cx - (cx - this.offsetX) * (this.scale / prevScale);
    this.offsetY = cy - (cy - this.offsetY) * (this.scale / prevScale);
    this.render();
  }

  screenToImageCoords(screenX, screenY) {
    return {
      x: (screenX - this.offsetX) / this.scale,
      y: (screenY - this.offsetY) / this.scale
    };
  }

  imageToScreenCoords(imgX, imgY) {
    return {
      x: imgX * this.scale + this.offsetX,
      y: imgY * this.scale + this.offsetY
    };
  }

  initEventListeners() {
    window.addEventListener('resize', () => this.resize());

    this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
    this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    window.addEventListener('mouseup', () => this.handleMouseUp());

    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.12 : 0.89;
      const mouse = this.screenToImageCoords(e.offsetX, e.offsetY);
      const prevScale = this.scale;
      this.scale = Math.max(0.1, Math.min(10.0, this.scale * zoomFactor));
      this.offsetX = e.offsetX - mouse.x * this.scale;
      this.offsetY = e.offsetY - mouse.y * this.scale;
      this.render();
    }, { passive: false });
  }

  handleMouseDown(e) {
    if (!this.image) return;
    const imgPos = this.screenToImageCoords(e.offsetX, e.offsetY);

    if (this.mode === 'eyedropper') {
      if (imgPos.x >= 0 && imgPos.x < this.image.naturalWidth &&
          imgPos.y >= 0 && imgPos.y < this.image.naturalHeight) {
        this.onEyedropper(Math.round(imgPos.x), Math.round(imgPos.y));
      }
      return;
    }

    if (this.calibrationMode === 'box') {
      const brScreen = this.imageToScreenCoords(this.box.x + this.box.w, this.box.y + this.box.h);
      const distBr = Math.hypot(brScreen.x - e.offsetX, brScreen.y - e.offsetY);
      if (distBr <= this.resizeHandleRadius + 6) {
        this.boxAction = 'resize';
        this.boxDragStart = { x: imgPos.x, y: imgPos.y, boxX: this.box.x, boxY: this.box.y, boxW: this.box.w, boxH: this.box.h };
        return;
      }

      if (imgPos.x >= this.box.x && imgPos.x <= this.box.x + this.box.w &&
          imgPos.y >= this.box.y && imgPos.y <= this.box.y + this.box.h) {
        this.boxAction = 'move';
        this.boxDragStart = { x: imgPos.x, y: imgPos.y, boxX: this.box.x, boxY: this.box.y, boxW: this.box.w, boxH: this.box.h };
        return;
      }
    }

    if (this.calibrationMode === 'pins') {
      for (const key in this.pins) {
        const pin = this.pins[key];
        const screenPos = this.imageToScreenCoords(pin.x, pin.y);
        const offset = this.getBadgeOffset(key);
        const badgeX = screenPos.x + offset.ox;
        const badgeY = screenPos.y + offset.oy;

        const distCross = Math.hypot(screenPos.x - e.offsetX, screenPos.y - e.offsetY);
        const distBadge = Math.hypot(badgeX - e.offsetX, badgeY - e.offsetY);

        // Click either the crosshair vertex or the floating badge to drag
        if (distCross <= 12 || distBadge <= this.pinRadius + 4) {
          this.draggedPin = key;
          return;
        }
      }
    }

    this.isPanning = true;
    this.panStartX = e.offsetX - this.offsetX;
    this.panStartY = e.offsetY - this.offsetY;
  }

  handleMouseMove(e) {
    const imgPos = this.screenToImageCoords(e.offsetX, e.offsetY);

    if (this.boxAction === 'move') {
      const dx = imgPos.x - this.boxDragStart.x;
      const dy = imgPos.y - this.boxDragStart.y;
      this.box.x = Math.round(this.boxDragStart.boxX + dx);
      this.box.y = Math.round(this.boxDragStart.boxY + dy);
      this.updatePinsFromBox();
      this.render();
      return;
    }

    if (this.boxAction === 'resize') {
      const dx = imgPos.x - this.boxDragStart.x;
      const newW = Math.max(80, Math.round(this.boxDragStart.boxW + dx));
      const newH = Math.round(newW / this.aspectRatio);

      this.box.w = newW;
      this.box.h = newH;
      this.updatePinsFromBox();
      this.render();
      return;
    }

    if (this.draggedPin) {
      this.pins[this.draggedPin].x = Math.round(imgPos.x);
      this.pins[this.draggedPin].y = Math.round(imgPos.y);
      if (this.onTransformChange) this.onTransformChange(this.pins);
      this.render();
      return;
    }

    if (this.isPanning) {
      this.offsetX = e.offsetX - this.panStartX;
      this.offsetY = e.offsetY - this.panStartY;
      this.render();
    }
  }

  handleMouseUp() {
    this.isPanning = false;
    this.draggedPin = null;
    this.boxAction = null;
  }

  setVectorPreview(previewData) {
    this.vectorPreview = previewData;
    this.render();
  }

  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    if (!this.image) return;

    ctx.save();
    ctx.translate(this.offsetX, this.offsetY);
    ctx.scale(this.scale, this.scale);

    ctx.drawImage(this.image, 0, 0);

    // Live Reference India Boundary
    if (this.referenceGeojson && this.geoTransform && this.geoTransform.isCalibrated) {
      ctx.save();
      ctx.strokeStyle = this.overlayColor;
      ctx.lineWidth = 1.6 / this.scale;
      ctx.fillStyle = this.getOverlayFillColor();
      ctx.globalAlpha = this.overlayOpacity;

      this.drawGeoJson(ctx, this.referenceGeojson);
      ctx.restore();
    }

    // Vector preview polygons
    if (this.vectorPreview && this.vectorPreview.length > 0) {
      for (const item of this.vectorPreview) {
        ctx.fillStyle = item.color;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1 / this.scale;
        ctx.globalAlpha = this.overlayOpacity;

        for (const ring of item.rings) {
          if (ring.length < 3) continue;
          ctx.beginPath();
          ctx.moveTo(ring[0].x, ring[0].y);
          for (let i = 1; i < ring.length; i++) {
            ctx.lineTo(ring[i].x, ring[i].y);
          }
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      }
    }

    ctx.restore();

    // Calibration Overlay
    if (this.calibrationMode === 'box') {
      const tl = this.imageToScreenCoords(this.box.x, this.box.y);
      const br = this.imageToScreenCoords(this.box.x + this.box.w, this.box.y + this.box.h);
      const bw = br.x - tl.x;
      const bh = br.y - tl.y;

      ctx.save();
      ctx.strokeStyle = this.overlayColor;
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = 2;
      ctx.strokeRect(tl.x, tl.y, bw, bh);

      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(br.x, br.y, this.resizeHandleRadius, 0, Math.PI * 2);
      ctx.fillStyle = this.overlayColor;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      ctx.restore();
    } else {
      // 10 Precision Pins: Open-center crosshair + outward floating letter badge
      for (const key in this.pins) {
        const pin = this.pins[key];
        const screenPos = this.imageToScreenCoords(pin.x, pin.y);
        const offset = this.getBadgeOffset(key);
        const badgeX = screenPos.x + offset.ox;
        const badgeY = screenPos.y + offset.oy;

        const arm = 7; // crosshair arm length
        const gap = 2; // open center gap so the vertex underneath is 100% visible

        ctx.save();

        // 1. Leader line connecting vertex to floating badge
        ctx.beginPath();
        ctx.moveTo(screenPos.x, screenPos.y);
        ctx.lineTo(badgeX, badgeY);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.lineWidth = 1.2;
        ctx.setLineDash([2, 2]);
        ctx.stroke();
        ctx.setLineDash([]);

        // 2. High-contrast Crosshair (Dark outline for contrast on white/colored maps)
        ctx.lineWidth = 3.5;
        ctx.strokeStyle = '#000000';
        ctx.beginPath();
        ctx.moveTo(screenPos.x - arm, screenPos.y);
        ctx.lineTo(screenPos.x - gap, screenPos.y);
        ctx.moveTo(screenPos.x + gap, screenPos.y);
        ctx.lineTo(screenPos.x + arm, screenPos.y);
        ctx.moveTo(screenPos.x, screenPos.y - arm);
        ctx.lineTo(screenPos.x, screenPos.y - gap);
        ctx.moveTo(screenPos.x, screenPos.y + gap);
        ctx.lineTo(screenPos.x, screenPos.y + arm);
        ctx.stroke();

        // Inner colored crosshair
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = pin.color;
        ctx.stroke();

        // 3. Floating circular badge with alphabet code
        ctx.beginPath();
        ctx.arc(badgeX, badgeY, this.pinRadius, 0, Math.PI * 2);
        ctx.fillStyle = pin.color;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 8.5px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(pin.label, badgeX, badgeY);

        ctx.restore();
      }
    }
  }

  drawGeoJson(ctx, geojson) {
    const features = geojson.features || [geojson];
    for (const feat of features) {
      const geom = feat.geometry;
      if (!geom) continue;
      if (geom.type === 'Polygon') {
        this.renderPolygonCoords(ctx, geom.coordinates);
      } else if (geom.type === 'MultiPolygon') {
        for (const poly of geom.coordinates) {
          this.renderPolygonCoords(ctx, poly);
        }
      }
    }
  }

  renderPolygonCoords(ctx, rings) {
    for (const ring of rings) {
      if (ring.length < 3) continue;
      ctx.beginPath();
      const first = this.geoTransform.geoToPixel(ring[0][0], ring[0][1]);
      ctx.moveTo(first.x, first.y);
      for (let i = 1; i < ring.length; i++) {
        const pt = this.geoTransform.geoToPixel(ring[i][0], ring[i][1]);
        ctx.lineTo(pt.x, pt.y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }
}