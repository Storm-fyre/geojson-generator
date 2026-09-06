/**
 * Master Application Controller - IndicAtlas GeoJSON Generator
 */
import { MapViewport } from './canvas.js';
import { GeoTransform } from './transform.js';
import { ColorExtractor } from './colorExtractor.js';
import { Morphology } from './morphology.js';
import { Vectorizer } from './vectorizer.js';
import { GeoJsonExporter } from './geojsonExporter.js';

class AppController {
  constructor() {
    this.transform = new GeoTransform();
    this.soilProperties = {};
    this.activeSoilKey = null;
    this.extractedFeatures = [];
    this.previewLayers = [];
    this.indiaGeojson = null;

    this.initElements();
    this.initCanvas();
    this.bindUiEvents();
    this.loadDefaultSoilProperties();
    this.loadIndiaReference();
  }

  initElements() {
    this.workbench = document.getElementById('workbench');
    this.btnToggleSidebar = document.getElementById('btnToggleSidebar');
    this.imageInput = document.getElementById('imageInput');
    this.soilMetaInput = document.getElementById('soilMetaInput');
    this.btnExport = document.getElementById('btnExport');
    this.btnPickColor = document.getElementById('btnPickColor');
    this.btnGeneratePreview = document.getElementById('btnGeneratePreview');
    this.soilSelect = document.getElementById('soilSelect');
    this.activeColorInput = document.getElementById('activeColorInput');
    this.activeColorHex = document.getElementById('activeColorHex');
    this.colorTolerance = document.getElementById('colorTolerance');
    this.tolVal = document.getElementById('tolVal');
    this.overlayOpacity = document.getElementById('overlayOpacity');
    this.morphClosing = document.getElementById('morphClosing');
    this.minArea = document.getElementById('minArea');
    this.simplifyTol = document.getElementById('simplifyTol');
    this.soilChipsList = document.getElementById('soilChipsList');
    this.statusMessage = document.getElementById('statusMessage');

    this.btnModeBox = document.getElementById('btnModeBox');
    this.btnModePins = document.getElementById('btnModePins');
    this.boxControls = document.getElementById('boxControls');
    this.pinControls = document.getElementById('pinControls');
    this.boxScaleSlider = document.getElementById('boxScaleSlider');
    this.boxScaleVal = document.getElementById('boxScaleVal');

    if (this.minArea) {
      this.minArea.value = 15;
    }
  }

  initCanvas() {
    this.viewport = new MapViewport(
      'mapCanvas',
      (pins) => this.onTransformChange(pins),
      (x, y) => this.onColorSampled(x, y)
    );
    this.viewport.resize();
  }

  async loadIndiaReference() {
    try {
      const response = await fetch('data/india.geojson');
      if (response.ok) {
        this.indiaGeojson = await response.json();
        this.viewport.setReferenceGeojson(this.indiaGeojson, this.transform);
        this.statusMessage.textContent = "India boundary reference loaded. Position box over map.";
      }
    } catch (e) {
      console.warn("Could not fetch data/india.geojson automatically.", e);
    }
  }

  loadDefaultSoilProperties() {
    this.soilProperties = {
      forest_mountain: { name: "Forest & Mountain Soils", color: "#2e7d32" },
      alluvial: { name: "Alluvial Soils", color: "#a1d971" },
      red_yellow: { name: "Red and Yellow Soils", color: "#e53935" },
      black: { name: "Black Soils (Regur)", color: "#424242" },
      laterite: { name: "Laterite Soils", color: "#fbc02d" },
      arid: { name: "Arid / Desert Soils", color: "#f5eed7" }
    };
    this.populateSoilSelectors();
  }

  populateSoilSelectors() {
    this.soilSelect.innerHTML = '';
    this.soilChipsList.innerHTML = '';

    const keys = Object.keys(this.soilProperties);
    keys.forEach((key, idx) => {
      const soil = this.soilProperties[key];

      const option = document.createElement('option');
      option.value = key;
      option.textContent = soil.name;
      this.soilSelect.appendChild(option);

      const chip = document.createElement('div');
      chip.className = `soil-chip ${idx === 0 ? 'active' : ''}`;
      chip.dataset.key = key;
      chip.innerHTML = `
        <span class="chip-dot" style="background-color: ${soil.color}"></span>
        <span>${soil.name}</span>
      `;
      chip.addEventListener('click', () => this.selectActiveSoil(key));
      this.soilChipsList.appendChild(chip);
    });

    if (keys.length > 0) {
      this.selectActiveSoil(keys[0]);
    }
  }

  selectActiveSoil(key) {
    this.activeSoilKey = key;
    this.soilSelect.value = key;
    const soil = this.soilProperties[key];
    if (soil && soil.color) {
      this.activeColorInput.value = soil.color;
      this.activeColorHex.textContent = soil.color.toUpperCase();
    }

    document.querySelectorAll('.soil-chip').forEach(chip => {
      chip.classList.toggle('active', chip.dataset.key === key);
    });
  }

  bindUiEvents() {
    if (this.btnToggleSidebar && this.workbench) {
      this.btnToggleSidebar.addEventListener('click', () => {
        this.workbench.classList.toggle('sidebar-collapsed');
        setTimeout(() => this.viewport.resize(), 260);
      });
    }

    this.btnModeBox.addEventListener('click', () => {
      this.btnModeBox.classList.add('active');
      this.btnModePins.classList.remove('active');
      this.boxControls.style.display = 'block';
      this.pinControls.style.display = 'none';
      this.viewport.setCalibrationMode('box');
      this.statusMessage.textContent = "Box mode: Drag to move, drag corner handle to scale.";
    });

    this.btnModePins.addEventListener('click', () => {
      this.btnModePins.classList.add('active');
      this.btnModeBox.classList.remove('active');
      this.boxControls.style.display = 'none';
      this.pinControls.style.display = 'block';
      this.viewport.setCalibrationMode('pins');
      this.statusMessage.textContent = "7-Point TPS mode: Nudge individual boundary pins.";
    });

    this.boxScaleSlider.addEventListener('input', (e) => {
      const val = e.target.value;
      this.boxScaleVal.textContent = `${val}%`;
      this.viewport.setBoxScalePercent(parseInt(val, 10));
    });

    this.imageInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        this.viewport.loadImage(evt.target.result).then(() => {
          this.transform.calibrate(this.viewport.pins);
          this.viewport.updateTransform(this.transform);
          this.btnGeneratePreview.disabled = false;
          this.statusMessage.textContent = "Image loaded. Move & scale the box to fit.";
        });
      };
      reader.readAsDataURL(file);
    });

    this.soilMetaInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          this.soilProperties = JSON.parse(evt.target.result);
          this.populateSoilSelectors();
          this.statusMessage.textContent = "Custom metadata loaded successfully.";
        } catch (err) {
          alert("Invalid JSON format.");
        }
      };
      reader.readAsText(file);
    });

    this.onTransformChange = (pins) => {
      this.transform.calibrate(pins);
      this.viewport.updateTransform(this.transform);
    };

    this.btnPickColor.addEventListener('click', () => {
      if (this.viewport.mode === 'eyedropper') {
        this.viewport.mode = 'navigate';
        this.btnPickColor.textContent = '🎯 Pick from Canvas';
        this.statusMessage.textContent = 'Navigation mode: Zoom & Pan active.';
      } else {
        this.viewport.mode = 'eyedropper';
        this.btnPickColor.textContent = '❌ Cancel Eyedropper';
        this.statusMessage.textContent = 'Click on any class region in the map to sample.';
      }
    });

    this.onColorSampled = (x, y) => {
      const offCanvas = document.createElement('canvas');
      offCanvas.width = this.viewport.image.naturalWidth;
      offCanvas.height = this.viewport.image.naturalHeight;
      const offCtx = offCanvas.getContext('2d');
      offCtx.drawImage(this.viewport.image, 0, 0);

      const pixel = offCtx.getImageData(x, y, 1, 1).data;
      const hex = `#${((1 << 24) + (pixel[0] << 16) + (pixel[1] << 8) + pixel[2]).toString(16).slice(1)}`;

      this.activeColorInput.value = hex;
      this.activeColorHex.textContent = hex.toUpperCase();

      if (this.activeSoilKey && this.soilProperties[this.activeSoilKey]) {
        this.soilProperties[this.activeSoilKey].color = hex;
        const activeChipDot = document.querySelector(`.soil-chip[data-key="${this.activeSoilKey}"] .chip-dot`);
        if (activeChipDot) activeChipDot.style.backgroundColor = hex;
      }

      this.viewport.mode = 'navigate';
      this.btnPickColor.textContent = '🎯 Pick from Canvas';
      this.statusMessage.textContent = `Sampled color: ${hex.toUpperCase()}`;
    };

    this.soilSelect.addEventListener('change', (e) => this.selectActiveSoil(e.target.value));

    this.activeColorInput.addEventListener('input', (e) => {
      const hex = e.target.value;
      this.activeColorHex.textContent = hex.toUpperCase();
      if (this.activeSoilKey && this.soilProperties[this.activeSoilKey]) {
        this.soilProperties[this.activeSoilKey].color = hex;
      }
    });

    this.colorTolerance.addEventListener('input', (e) => {
      this.tolVal.textContent = e.target.value;
    });

    this.overlayOpacity.addEventListener('input', (e) => {
      this.viewport.overlayOpacity = parseFloat(e.target.value);
      this.viewport.render();
    });

    document.getElementById('btnZoomIn').addEventListener('click', () => this.viewport.zoom(1.2));
    document.getElementById('btnZoomOut').addEventListener('click', () => this.viewport.zoom(0.8));
    document.getElementById('btnResetView').addEventListener('click', () => this.viewport.fitToScreen());

    this.btnGeneratePreview.addEventListener('click', () => this.processAllLayers());

    this.btnExport.addEventListener('click', () => {
      if (this.extractedFeatures.length === 0) return;
      const finalGeoJson = GeoJsonExporter.buildFeatureCollection(this.extractedFeatures);
      GeoJsonExporter.downloadJson(finalGeoJson, "soils.geojson");
    });
  }

  /**
   * Solid vector mask from calibrated reference boundary.
   * 1 strictly inside country, 0 in ocean/margins.
   */
  createLandMask(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);

    if (this.indiaGeojson && this.transform && this.transform.isCalibrated) {
      ctx.fillStyle = '#ffffff';
      const features = this.indiaGeojson.features || [this.indiaGeojson];

      for (const feat of features) {
        const geom = feat.geometry;
        if (!geom) continue;

        if (geom.type === 'Polygon') {
          this.drawRingsToCtx(ctx, geom.coordinates);
        } else if (geom.type === 'MultiPolygon') {
          for (const poly of geom.coordinates) {
            this.drawRingsToCtx(ctx, poly);
          }
        }
      }
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
    }

    const imgData = ctx.getImageData(0, 0, width, height).data;
    const mask = new Uint8Array(width * height);
    for (let i = 0, p = 0; i < imgData.length; i += 4, p++) {
      mask[p] = imgData[i] > 128 ? 1 : 0;
    }
    return mask;
  }

  drawRingsToCtx(ctx, rings) {
    for (const ring of rings) {
      if (ring.length < 3) continue;
      ctx.beginPath();
      const first = this.transform.geoToPixel(ring[0][0], ring[0][1]);
      ctx.moveTo(first.x, first.y);
      for (let i = 1; i < ring.length; i++) {
        const pt = this.transform.geoToPixel(ring[i][0], ring[i][1]);
        ctx.lineTo(pt.x, pt.y);
      }
      ctx.closePath();
      ctx.fill();
    }
  }

  processAllLayers() {
    if (!this.viewport.image) return;
    this.statusMessage.textContent = "Locking boundaries, healing seams... Please wait.";

    const img = this.viewport.image;
    const w = img.naturalWidth;
    const h = img.naturalHeight;

    const offCanvas = document.createElement('canvas');
    offCanvas.width = w;
    offCanvas.height = h;
    const ctx = offCanvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const imgData = ctx.getImageData(0, 0, w, h);

    const tolerance = parseInt(this.colorTolerance.value, 10);
    const kernelSize = parseInt(this.morphClosing.value, 10);
    const minArea = parseInt(this.minArea.value, 10);
    const simplifyTol = parseFloat(this.simplifyTol.value);

    // 1. Airtight Vector Landmask (1 = country interior, 0 = ocean & outside margins)
    const landMask = this.createLandMask(w, h);

    // 2. Identify boundary lines, state borders, and their anti-aliased edge halos (dilated by 2px)
    const lineMask = ColorExtractor.extractLineStrokeMask(imgData, 150, 2);

    // 3. Build Unified Labeled Grid:
    // Soil colors seed ONLY inside genuine interior land and cannot claim boundary lines or white paper
    const labeledGrid = new Uint8Array(w * h);
    const soilKeys = Object.keys(this.soilProperties);

    soilKeys.forEach((key, index) => {
      const soilId = index + 1;
      const meta = this.soilProperties[key];
      if (!meta.color) return;

      const isBlackSoil = (key === 'black' || meta.color.toLowerCase() === '#424242');

      // Extract raw color match with strict black soil discrimination
      let mask = ColorExtractor.extractColorMask(imgData, meta.color, tolerance, isBlackSoil);

      // Morphological OPENING cleans out any single-pixel noise and border line anti-aliasing fringes
      mask = Morphology.open(mask, w, h, 3);
      if (kernelSize > 1) {
        mask = Morphology.close(mask, w, h, kernelSize);
      }

      for (let i = 0; i < mask.length; i++) {
        if (mask[i] === 1 && landMask[i] === 1 && lineMask[i] === 0) {
          if (labeledGrid[i] === 0) {
            labeledGrid[i] = soilId;
          }
        }
      }
    });

    // 4. One-Way Inside-Out Seam Healing:
    // Legitimate interior soils expand outward through border lines up to the exact vector boundary
    const healedGrid = Morphology.healSeams(labeledGrid, landMask, w, h);

    // 5. Trace and smooth contours for each soil type
    const interimLayers = [];
    soilKeys.forEach((key, index) => {
      const soilId = index + 1;
      const meta = this.soilProperties[key];
      if (!meta.color) return;

      const soilMask = new Uint8Array(w * h);
      for (let i = 0; i < healedGrid.length; i++) {
        if (healedGrid[i] === soilId) {
          soilMask[i] = 1;
        }
      }

      const rawContours = Vectorizer.traceContours(soilMask, w, h, minArea);
      const simplifiedRings = rawContours.map(ring => Vectorizer.simplify(ring, simplifyTol));

      if (simplifiedRings.length > 0) {
        interimLayers.push({
          key,
          meta,
          color: meta.color,
          rings: simplifiedRings
        });
      }
    });

    // 6. Topological Shared-Edge Vertex Snapping
    Vectorizer.snapSharedVertices(interimLayers, 1.6);

    // 7. Assemble finalized GeoJSON Features
    this.extractedFeatures = [];
    this.previewLayers = [];

    for (const item of interimLayers) {
      this.previewLayers.push({
        color: item.color,
        rings: item.rings
      });

      const feature = GeoJsonExporter.createSoilFeature(item.key, item.meta, item.rings, this.transform);
      if (feature) {
        this.extractedFeatures.push(feature);
      }
    }

    this.viewport.setVectorPreview(this.previewLayers);
    this.btnExport.disabled = this.extractedFeatures.length === 0;
    this.statusMessage.textContent = `Done! Extracted ${this.extractedFeatures.length} classes. Boundaries locked.`;
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new AppController();
});