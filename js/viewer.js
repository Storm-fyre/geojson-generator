/**
 * Leaflet GeoJSON Validator & Soil Map Inspector Controller
 */

class GeoJsonViewer {
  constructor() {
    this.map = null;
    this.baseLayers = {};
    this.currentBaseLayer = null;

    this.soilsLayer = null;
    this.indiaLayer = null;

    this.soilsData = null;
    this.indiaData = null;

    this.wireframeMode = false;
    this.fillOpacity = 0.65;
    this.activeFeatureLayer = null;

    this.initElements();
    this.initLeaflet();
    this.bindEvents();
    this.loadInitialData();
  }

  initElements() {
    this.mapContainer = document.getElementById('map');
    this.dropOverlay = document.getElementById('dropOverlay');
    this.fileInputSoils = document.getElementById('fileInputSoils');
    this.fileInputIndia = document.getElementById('fileInputIndia');
    this.baseMapSelect = document.getElementById('baseMapSelect');
    this.chkShowIndia = document.getElementById('chkShowIndia');
    this.chkWireframeMode = document.getElementById('chkWireframeMode');
    this.sliderOpacity = document.getElementById('sliderOpacity');
    this.valOpacity = document.getElementById('valOpacity');
    this.btnFitBounds = document.getElementById('btnFitBounds');
    this.legendContainer = document.getElementById('legendContainer');
    this.classCountBadge = document.getElementById('classCountBadge');
    this.inspectorContent = document.getElementById('inspectorContent');
    this.inspectModeHint = document.getElementById('inspectModeHint');
  }

  initLeaflet() {
    // Center over India: [lat, lon]
    this.map = L.map('map', {
      center: [22.5, 82.0],
      zoom: 5,
      minZoom: 4,
      maxZoom: 14,
      zoomControl: false
    });

    L.control.zoom({ position: 'topleft' }).addTo(this.map);

    // Tile providers
    this.baseLayers = {
      dark: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://carto.com/">CARTO</a>, OpenStreetMap',
        maxZoom: 19
      }),
      satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri, Earthstar Geographics',
        maxZoom: 18
      }),
      streets: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19
      }),
      light: L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://carto.com/">CARTO</a>, OpenStreetMap',
        maxZoom: 19
      })
    };

    this.currentBaseLayer = this.baseLayers.dark;
    this.currentBaseLayer.addTo(this.map);
  }

  bindEvents() {
    // Base layer selector
    this.baseMapSelect.addEventListener('change', (e) => {
      const selected = e.target.value;
      if (this.baseLayers[selected]) {
        this.map.removeLayer(this.currentBaseLayer);
        this.currentBaseLayer = this.baseLayers[selected];
        this.currentBaseLayer.addTo(this.map);
        if (this.indiaLayer) this.indiaLayer.bringToFront();
        if (this.soilsLayer) this.soilsLayer.bringToFront();
      }
    });

    // Reference boundary toggle
    this.chkShowIndia.addEventListener('change', (e) => {
      if (!this.indiaLayer) return;
      if (e.target.checked) {
        this.indiaLayer.addTo(this.map);
      } else {
        this.map.removeLayer(this.indiaLayer);
      }
    });

    // Wireframe Mode (topology/gap detection)
    this.chkWireframeMode.addEventListener('change', (e) => {
      this.wireframeMode = e.target.checked;
      this.updateSoilsStyle();
    });

    // Opacity slider
    this.sliderOpacity.addEventListener('input', (e) => {
      this.fillOpacity = parseFloat(e.target.value);
      this.valOpacity.textContent = this.fillOpacity.toFixed(2);
      this.updateSoilsStyle();
    });

    // Fit Bounds button
    this.btnFitBounds.addEventListener('click', () => {
      if (this.soilsLayer && this.soilsLayer.getLayers().length > 0) {
        this.map.fitBounds(this.soilsLayer.getBounds(), { padding: [20, 20] });
      } else if (this.indiaLayer) {
        this.map.fitBounds(this.indiaLayer.getBounds(), { padding: [20, 20] });
      }
    });

    // File inputs
    this.fileInputSoils.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) this.readGeoJsonFile(file, 'soils');
    });

    this.fileInputIndia.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) this.readGeoJsonFile(file, 'india');
    });

    // Drag and Drop files onto map
    const mapEl = this.mapContainer;
    ['dragenter', 'dragover'].forEach(name => {
      mapEl.addEventListener(name, (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.dropOverlay.classList.add('active');
      });
    });

    ['dragleave', 'drop'].forEach(name => {
      mapEl.addEventListener(name, (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.dropOverlay.classList.remove('active');
      });
    });

    mapEl.addEventListener('drop', (e) => {
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        const file = files[0];
        const lowerName = file.name.toLowerCase();
        if (lowerName.includes('india')) {
          this.readGeoJsonFile(file, 'india');
        } else {
          this.readGeoJsonFile(file, 'soils');
        }
      }
    });
  }

  async loadInitialData() {
    // 1. Auto-fetch reference boundary
    try {
      const resIndia = await fetch('data/india.geojson');
      if (resIndia.ok) {
        const data = await resIndia.json();
        this.renderIndiaLayer(data);
      }
    } catch (err) {
      console.warn('Could not auto-fetch data/india.geojson:', err);
    }

    // 2. Auto-fetch soils.geojson if present in data/
    try {
      const resSoils = await fetch('data/soils.geojson');
      if (resSoils.ok) {
        const data = await resSoils.json();
        this.renderSoilsLayer(data);
      }
    } catch (err) {
      console.info('data/soils.geojson not found automatically. Load one via header button.');
    }
  }

  readGeoJsonFile(file, type) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const geojson = JSON.parse(e.target.result);
        if (type === 'india') {
          this.renderIndiaLayer(geojson);
        } else {
          this.renderSoilsLayer(geojson);
        }
      } catch (err) {
        alert(`Error parsing JSON: ${err.message}`);
      }
    };
    reader.readAsText(file);
  }

  renderIndiaLayer(geojson) {
    this.indiaData = geojson;
    if (this.indiaLayer) {
      this.map.removeLayer(this.indiaLayer);
    }

    this.indiaLayer = L.geoJSON(geojson, {
      style: {
        color: '#00ffff',
        weight: 1.5,
        opacity: 0.85,
        fillColor: '#00ffff',
        fillOpacity: 0.04,
        dashArray: '4, 4'
      },
      interactive: false
    });

    if (this.chkShowIndia.checked) {
      this.indiaLayer.addTo(this.map);
    }
  }

  renderSoilsLayer(geojson) {
    this.soilsData = geojson;
    if (this.soilsLayer) {
      this.map.removeLayer(this.soilsLayer);
    }

    this.soilsLayer = L.geoJSON(geojson, {
      style: (feat) => this.getFeatureStyle(feat),
      onEachFeature: (feat, layer) => this.attachFeatureInteractions(feat, layer)
    });

    this.soilsLayer.addTo(this.map);

    if (this.soilsLayer.getLayers().length > 0) {
      this.map.fitBounds(this.soilsLayer.getBounds(), { padding: [25, 25] });
    }

    this.populateLegend(geojson);
    this.inspectModeHint.textContent = `${geojson.features ? geojson.features.length : 0} features active`;
  }

  getFeatureStyle(feature) {
    const props = feature.properties || {};
    const baseColor = props.color || '#3b82f6';

    if (this.wireframeMode) {
      return {
        color: '#ff0055',
        weight: 1.8,
        opacity: 0.95,
        fillColor: 'transparent',
        fillOpacity: 0
      };
    }

    return {
      color: '#ffffff',
      weight: 0.7,
      opacity: 0.8,
      fillColor: baseColor,
      fillOpacity: this.fillOpacity
    };
  }

  updateSoilsStyle() {
    if (!this.soilsLayer) return;
    this.soilsLayer.setStyle((feat) => this.getFeatureStyle(feat));
  }

  attachFeatureInteractions(feature, layer) {
    layer.on({
      mouseover: (e) => {
        const l = e.target;
        if (!this.wireframeMode) {
          l.setStyle({
            weight: 2.2,
            color: '#ffff00',
            fillOpacity: Math.min(1.0, this.fillOpacity + 0.25)
          });
        }
      },
      mouseout: (e) => {
        const l = e.target;
        if (l !== this.activeFeatureLayer) {
          this.soilsLayer.resetStyle(l);
        }
      },
      click: (e) => {
        L.DomEvent.stopPropagation(e);
        if (this.activeFeatureLayer && this.activeFeatureLayer !== layer) {
          this.soilsLayer.resetStyle(this.activeFeatureLayer);
        }
        this.activeFeatureLayer = layer;
        layer.setStyle({ weight: 2.5, color: '#00ffea' });
        this.displayFeatureInspector(feature.properties);
      }
    });

    // Tooltip with Name & Soil Key
    const p = feature.properties || {};
    const tooltipText = `<strong>${p.name || p.soil_key || 'Soil Class'}</strong>`;
    layer.bindTooltip(tooltipText, { sticky: true, className: 'leaflet-soil-tooltip' });
  }

  populateLegend(geojson) {
    this.legendContainer.innerHTML = '';
    const features = geojson.features || [];
    this.classCountBadge.textContent = `${features.length} classes`;

    if (features.length === 0) {
      this.legendContainer.innerHTML = '<div class="empty-state">No features found in GeoJSON.</div>';
      return;
    }

    features.forEach((feat, idx) => {
      const p = feat.properties || {};
      const name = p.name || p.soil_key || `Class #${idx + 1}`;
      const color = p.color || '#3b82f6';

      const item = document.createElement('div');
      item.className = 'legend-item';
      item.innerHTML = `
        <span class="legend-swatch" style="background-color: ${color}"></span>
        <span style="font-weight: 500;">${name}</span>
      `;

      item.addEventListener('click', () => {
        this.displayFeatureInspector(p);
        // Find corresponding map layer and highlight it
        this.soilsLayer.eachLayer((l) => {
          if (l.feature && l.feature.properties && l.feature.properties.soil_key === p.soil_key) {
            if (this.activeFeatureLayer) this.soilsLayer.resetStyle(this.activeFeatureLayer);
            this.activeFeatureLayer = l;
            l.setStyle({ weight: 2.5, color: '#00ffea' });
            this.map.fitBounds(l.getBounds(), { padding: [40, 40], maxZoom: 8 });
          }
        });
      });

      this.legendContainer.appendChild(item);
    });
  }

  displayFeatureInspector(props) {
    if (!props) {
      this.inspectorContent.innerHTML = '<div class="empty-state">No properties found.</div>';
      return;
    }

    const statesList = Array.isArray(props.states_covered)
      ? props.states_covered.map(s => `<span class="badge-tag">${s}</span>`).join('')
      : (props.states_covered || 'N/A');

    this.inspectorContent.innerHTML = `
      <div class="property-grid">
        <div class="property-row">
          <span class="property-label">Classification Name</span>
          <span class="property-val" style="font-size: 0.95rem; font-weight: 600; color: ${props.color || '#fff'};">
            ${props.name || props.soil_key || 'N/A'}
          </span>
        </div>

        <div class="property-row">
          <span class="property-label">Sub-Type / Scientific Class</span>
          <span class="property-val">${props.sub_type || 'N/A'}</span>
        </div>

        <div class="property-row">
          <span class="property-label">Geological Origin</span>
          <span class="property-val">${props.geological_origin || 'N/A'}</span>
        </div>

        <div class="property-row">
          <span class="property-label">Soil Texture</span>
          <span class="property-val">${props.texture || 'N/A'}</span>
        </div>

        <div class="property-row">
          <span class="property-label">Chemical Profile</span>
          <span class="property-val">${props.chemical_profile || 'N/A'}</span>
        </div>

        <div class="property-row">
          <span class="property-label">Distinctive Features</span>
          <span class="property-val">${props.distinctive_features || 'N/A'}</span>
        </div>

        <div class="property-row">
          <span class="property-label">Major Crops</span>
          <span class="property-val" style="color: #93c5fd;">${props.major_crops || 'N/A'}</span>
        </div>

        <div class="property-row">
          <span class="property-label">Covered States</span>
          <div style="margin-top: 0.2rem;">${statesList}</div>
        </div>
      </div>
    `;
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new GeoJsonViewer();
});