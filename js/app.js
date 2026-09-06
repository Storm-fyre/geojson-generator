/**
 * Master Application Controller - Truly Universal Thematic Engine
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
    this.thematicMetadata = {};
    this.legendKeys = [];
    this.themeName = "thematic_map";
    
    this.isRapidSampling = false;
    this.rapidSampleIndex = 0;

    this.extractedFeatures = [];
    this.previewLayers = [];
    this.indiaGeojson = null;

    this.initElements();
    this.initCanvas();
    this.bindUiEvents();
    this.loadIndiaReference();
    this.loadDefaultTheme();
  }

  initElements() {
    this.workbench = document.getElementById('workbench');
    this.btnToggleSidebar = document.getElementById('btnToggleSidebar');
    this.imageInput = document.getElementById('imageInput');
    this.metaInput = document.getElementById('metaInput');
    this.btnExport = document.getElementById('btnExport');
    this.btnRapidSample = document.getElementById('btnRapidSample');
    this.btnGeneratePreview = document.getElementById('btnGeneratePreview');
    this.legendCardsContainer = document.getElementById('legendCardsContainer');
    this.statusMessage = document.getElementById('statusMessage');

    this.btnModeBox = document.getElementById('btnModeBox');
    this.btnModePins = document.getElementById('btnModePins');
    this.boxControls = document.getElementById('boxControls');
    this.pinControls = document.getElementById('pinControls');

    // Advanced tuning controls
    this.colorTolerance = document.getElementById('colorTolerance');
    this.tolVal = document.getElementById('tolVal');
    this.morphClosing = document.getElementById('morphClosing');
    this.morphVal = document.getElementById('morphVal');
    this.minArea = document.getElementById('minArea');
    this.simplifyTol = document.getElementById('simplifyTol');
    this.simplifyVal = document.getElementById('simplifyVal');
    this.overlayOpacity = document.getElementById('overlayOpacity');
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
        this.statusMessage.textContent = "India reference loaded. Load your map image to begin.";
      }
    } catch (e) {
      console.warn("Could not load reference data/india.geojson", e);
    }
  }

  async loadDefaultTheme() {
    try {
      const res = await fetch('data/soil_properties.json');
      if (res.ok) {
        const data = await res.json();
        this.themeName = "soils";
        this.parseLegendData(data);
      }
    } catch (e) {
      console.log("No default soil_properties.json found. Ready for custom JSON.");
    }
  }

  /**
   * Universal parser for any thematic JSON:
   * Supports dictionaries { key: { name: "...", color: "...", ... } }
   * or arrays of objects [ { key: "...", name: "...", ... } ]
   */
  parseLegendData(data) {
    this.thematicMetadata = {};
    this.legendKeys = [];

    if (Array.isArray(data)) {
      data.forEach((item, idx) => {
        const key = item.key || item.id || `class_${idx + 1}`;
        this.thematicMetadata[key] = {
          name: item.name || item.title || key,
          color: item.color || "#424242",
          ...item
        };
        this.legendKeys.push(key);
      });
    } else if (typeof data === 'object' && data !== null) {
      for (const key in data) {
        if (key.startsWith('_')) continue; // skip metadata like _theme_name
        const val = data[key];
        if (typeof val === 'object' && val !== null) {
          this.thematicMetadata[key] = {
            name: val.name || val.title || key,
            color: val.color || "#424242",
            ...val
          };
        } else {
          this.thematicMetadata[key] = {
            name: String(val),
            color: "#424242"
          };
        }
        this.legendKeys.push(key);
      }
      if (data._theme_name) {
        this.themeName = data._theme_name;
      }
    }

    this.renderLegendCards();
    this.btnRapidSample.disabled = this.legendKeys.length === 0 || !this.viewport.image;
    this.btnExport.textContent = `💾 Export ${this.themeName}.geojson`;
  }

  renderLegendCards() {
    this.legendCardsContainer.innerHTML = '';
    if (this.legendKeys.length === 0) {
      this.legendCardsContainer.innerHTML = '<p class="muted empty-legend-notice">Load a JSON file to populate legend classes.</p>';
      return;
    }

    this.legendKeys.forEach((key, index) => {
      const item = this.thematicMetadata[key];

      const card = document.createElement('div');
      card.className = 'legend-card';
      card.id = `legend-card-${key}`;
      card.dataset.key = key;
      card.dataset.index = index;

      card.innerHTML = `
        <div class="legend-card-left">
          <span class="legend-card-title" title="${item.name}">${index + 1}. ${item.name}</span>
        </div>
        <div class="legend-card-right">
          <input type="color" class="swatch-picker" id="swatch-${key}" value="${item.color}">
        </div>
      `;

      // Manual color swatch change
      const picker = card.querySelector(`#swatch-${key}`);
      picker.addEventListener('input', (e) => {
        item.color = e.target.value;
      });

      // Clicking card allows single-class eyedropper
      card.addEventListener('click', (e) => {
        if (e.target.tagName.toLowerCase() === 'input') return;
        this.startSingleSample(key);
      });

      this.legendCardsContainer.appendChild(card);
    });
  }

  bindUiEvents() {
    if (this.btnToggleSidebar && this.workbench) {
      this.btnToggleSidebar.addEventListener('click', () => {
        this.workbench.classList.toggle('sidebar-collapsed');
        setTimeout(() => this.viewport.resize(), 260);
      });
    }

    // Step 1 Modes
    this.btnModeBox.addEventListener('click', () => {
      this.btnModeBox.classList.add('active');
      this.btnModePins.classList.remove('active');
      this.boxControls.style.display = 'block';
      this.pinControls.style.display = 'none';
      this.viewport.setCalibrationMode('box');
      this.statusMessage.textContent = "Box mode: Drag to move; drag bottom-right corner to scale.";
    });

    this.btnModePins.addEventListener('click', () => {
      this.btnModePins.classList.add('active');
      this.btnModeBox.classList.remove('active');
      this.boxControls.style.display = 'none';
      this.pinControls.style.display = 'block';
      this.viewport.setCalibrationMode('pins');
      this.statusMessage.textContent = "7-Point TPS mode: Drag pins to match coastline and border vertices.";
    });

    // Image Input
    this.imageInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        this.viewport.loadImage(evt.target.result).then(() => {
          this.transform.calibrate(this.viewport.pins);
          this.viewport.updateTransform(this.transform);
          this.btnRapidSample.disabled = this.legendKeys.length === 0;
          this.btnGeneratePreview.disabled = false;
          this.statusMessage.textContent = "Image loaded. Calibrate box, then sample legend colors.";
        });
      };
      reader.readAsDataURL(file);
    });

    // Legend JSON Input
    this.metaInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const baseName = file.name.replace(/\.[^/.]+$/, "");
      this.themeName = baseName;

      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const parsed = JSON.parse(evt.target.result);
          this.parseLegendData(parsed);
          this.statusMessage.textContent = `Loaded ${this.legendKeys.length} legend classes from ${file.name}.`;
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

    // Sequential Rapid Eyedropper Trigger
    this.btnRapidSample.addEventListener('click', () => {
      if (this.isRapidSampling) {
        this.stopRapidSampling();
      } else {
        this.startRapidSampling();
      }
    });

    // Navigation & Overlay controls
    document.getElementById('btnZoomIn').addEventListener('click', () => this.viewport.zoom(1.2));
    document.getElementById('btnZoomOut').addEventListener('click', () => this.viewport.zoom(0.8));
    document.getElementById('btnResetView').addEventListener('click', () => this.viewport.fitToScreen());

    this.overlayOpacity.addEventListener('input', (e) => {
      this.viewport.overlayOpacity = parseFloat(e.target.value);
      this.viewport.render();
    });

    // Advanced Sliders Value Labels
    this.colorTolerance.addEventListener('input', (e) => this.tolVal.textContent = e.target.value);
    this.morphClosing.addEventListener('input', (e) => this.morphVal.textContent = `${e.target.value}px`);
    this.simplifyTol.addEventListener('input', (e) => this.simplifyVal.textContent = parseFloat(e.target.value).toFixed(1));

    // Extraction & Export
    this.btnGeneratePreview.addEventListener('click', () => this.processAllLayers());

    this.btnExport.addEventListener('click', () => {
      if (this.extractedFeatures.length === 0) return;
      const finalGeoJson = GeoJsonExporter.buildFeatureCollection(this.extractedFeatures, this.themeName);
      GeoJsonExporter.downloadJson(finalGeoJson, `${this.themeName}.geojson`);
    });
  }

  /* -------------------------------------------------------------
     Sequential Auto-Advancing Color Sampler Engine
     ------------------------------------------------------------- */
  startRapidSampling() {
    if (!this.viewport.image || this.legendKeys.length === 0) return;

    this.isRapidSampling = true;
    this.rapidSampleIndex = 0;
    this.viewport.mode = 'eyedropper';

    this.btnRapidSample.textContent = '❌ Cancel Rapid Sampling';
    this.btnRapidSample.classList.add('sampling-active');
    this.statusMessage.classList.add('sampling-target');

    this.promptNextRapidSample();
  }

  stopRapidSampling() {
    this.isRapidSampling = false;
    this.viewport.mode = 'navigate';

    this.btnRapidSample.textContent = '⚡ Rapid-Sample All Colors';
    this.btnRapidSample.classList.remove('sampling-active');
    this.statusMessage.classList.remove('sampling-target');

    document.querySelectorAll('.legend-card').forEach(c => c.classList.remove('sampling-target'));
    this.statusMessage.textContent = "Color sampling finished. Ready to trace & preview.";
  }

  promptNextRapidSample() {
    if (this.rapidSampleIndex >= this.legendKeys.length) {
      this.stopRapidSampling();
      this.statusMessage.textContent = "✅ All legend colors captured! Ready to Trace & Preview.";
      return;
    }

    const currentKey = this.legendKeys[this.rapidSampleIndex];
    const currentItem = this.thematicMetadata[currentKey];

    // Highlight card
    document.querySelectorAll('.legend-card').forEach(c => c.classList.remove('sampling-target'));
    const targetCard = document.getElementById(`legend-card-${currentKey}`);
    if (targetCard) {
      targetCard.classList.add('sampling-target');
      targetCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // Dynamic prompt banner
    this.statusMessage.textContent = `🎯 Tap map for: "${currentItem.name}" (${this.rapidSampleIndex + 1}/${this.legendKeys.length})`;
  }

  startSingleSample(key) {
    if (this.isRapidSampling) return;
    this.singleSampleKey = key;
    this.viewport.mode = 'eyedropper';
    const item = this.thematicMetadata[key];

    document.querySelectorAll('.legend-card').forEach(c => c.classList.remove('sampling-target'));
    const targetCard = document.getElementById(`legend-card-${key}`);
    if (targetCard) targetCard.classList.add('sampling-target');

    this.statusMessage.classList.add('sampling-target');
    this.statusMessage.textContent = `🎯 Tap map for: "${item.name}"`;
  }

  onColorSampled(x, y) {
    const offCanvas = document.createElement('canvas');
    offCanvas.width = this.viewport.image.naturalWidth;
    offCanvas.height = this.viewport.image.naturalHeight;
    const offCtx = offCanvas.getContext('2d');
    offCtx.drawImage(this.viewport.image, 0, 0);

    const pixel = offCtx.getImageData(x, y, 1, 1).data;
    const hex = `#${((1 << 24) + (pixel[0] << 16) + (pixel[1] << 8) + pixel[2]).toString(16).slice(1)}`;

    if (this.isRapidSampling) {
      const currentKey = this.legendKeys[this.rapidSampleIndex];
      this.thematicMetadata[currentKey].color = hex;

      const swatch = document.getElementById(`swatch-${currentKey}`);
      if (swatch) swatch.value = hex;

      this.rapidSampleIndex++;
      this.promptNextRapidSample();
    } else if (this.singleSampleKey) {
      this.thematicMetadata[this.singleSampleKey].color = hex;
      const swatch = document.getElementById(`swatch-${this.singleSampleKey}`);
      if (swatch) swatch.value = hex;

      this.singleSampleKey = null;
      this.viewport.mode = 'navigate';
      this.statusMessage.classList.remove('sampling-target');
      document.querySelectorAll('.legend-card').forEach(c => c.classList.remove('sampling-target'));
      this.statusMessage.textContent = `Color updated: ${hex.toUpperCase()}`;
    }
  }

  /* -------------------------------------------------------------
     Airtight Landmask & Thematic Vectorization Pipeline
     ------------------------------------------------------------- */
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
    if (!this.viewport.image || this.legendKeys.length === 0) return;
    this.statusMessage.textContent = "Locking boundaries & healing seams... Please wait.";

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

    // 1. Airtight Land Mask (1 = Country interior, 0 = Outside margin/ocean)
    const landMask = this.createLandMask(w, h);

    // 2. Identify Boundary Lines & dilate by 2px to eliminate anti-aliased edge ink
    const lineMask = ColorExtractor.extractLineStrokeMask(imgData, 150, 2);

    // 3. Unified Labeled Grid
    const labeledGrid = new Uint8Array(w * h);

    this.legendKeys.forEach((key, index) => {
      const classId = index + 1;
      const meta = this.thematicMetadata[key];
      if (!meta.color) return;

      const isAchromatic = (key.toLowerCase().includes('black') || meta.color.toLowerCase() === '#424242');

      let mask = ColorExtractor.extractColorMask(imgData, meta.color, tolerance, isAchromatic);
      mask = Morphology.open(mask, w, h, 3);
      if (kernelSize > 1) {
        mask = Morphology.close(mask, w, h, kernelSize);
      }

      for (let i = 0; i < mask.length; i++) {
        if (mask[i] === 1 && landMask[i] === 1 && lineMask[i] === 0) {
          if (labeledGrid[i] === 0) {
            labeledGrid[i] = classId;
          }
        }
      }
    });

    // 4. Seam Healing: Expand internal legitimate soils outward across gaps
    const healedGrid = Morphology.healSeams(labeledGrid, landMask, w, h);

    // 5. Trace & Smooth Contours
    const interimLayers = [];
    this.legendKeys.forEach((key, index) => {
      const classId = index + 1;
      const meta = this.thematicMetadata[key];
      if (!meta.color) return;

      const classMask = new Uint8Array(w * h);
      for (let i = 0; i < healedGrid.length; i++) {
        if (healedGrid[i] === classId) {
          classMask[i] = 1;
        }
      }

      const rawContours = Vectorizer.traceContours(classMask, w, h, minArea);
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

    // 6. Snapping
    Vectorizer.snapSharedVertices(interimLayers, 1.6);

    // 7. Assemble GeoJSON Features
    this.extractedFeatures = [];
    this.previewLayers = [];

    for (const item of interimLayers) {
      this.previewLayers.push({
        color: item.color,
        rings: item.rings
      });

      const feature = GeoJsonExporter.createThematicFeature(item.key, item.meta, item.rings, this.transform);
      if (feature) {
        this.extractedFeatures.push(feature);
      }
    }

    this.viewport.setVectorPreview(this.previewLayers);
    this.btnExport.disabled = this.extractedFeatures.length === 0;
    this.statusMessage.textContent = `Extracted ${this.extractedFeatures.length} classes. Ready to export.`;
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new AppController();
});