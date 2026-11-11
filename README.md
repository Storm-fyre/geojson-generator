# GeoJSON Generator — Raster-to-Vector Geospatial Pipeline

A zero-dependency, browser-based geospatial vectorization workbench designed to convert scanned raster thematic maps (soil, climate, vegetation, geomorphology) into topologically clean, CRS:84-compliant **GeoJSON `MultiPolygon` FeatureCollections**.

Built as the core cartographic digitization engine for [IndicAtlas](https://indicatlas.in).

## Key Engineering Features

* **10-Point Thin Plate Spline (TPS) Non-Rigid Calibration (`js/transform.js`):**
  * Solves a 2D radial basis function ($U(r) = \frac{1}{2} r^2 \ln r^2$) linear system via Gaussian elimination to map pixel coordinates `(x, y)` to `WGS84 (lon, lat)`.
  * Enables localized rubber-sheet warping across 10 geographic anchor landmarks without distorting distant coastlines.
* **Color Segmentation & Anti-Aliased Stroke Isolation (`js/colorExtractor.js`):**
  * Weighted Euclidean RGB extraction coupled with luminance/chroma constraints to separate dark charcoal thematic regions (e.g., Black Soil `#424242`) from dark boundary ink.
  * Automated dark-stroke detection and morphological dilation (`2px` halo encapsulation) to strip state borders, grid lines, and river strokes prior to region classification.
* **Morphological Filtering & Inside-Out Seam Healing (`js/morphology.js`):**
  * Morphological Opening and Closing (`erode` / `dilate`) to eliminate scanner speckle and bridge micro-pinholes.
  * **Multi-Source BFS Voronoi Seam Healing:** Expands classified interior pixels outward across erased boundary trenches, constrained strictly by a rasterized mainland vector landmask.
* **Contour Extraction, RDP Smoothing & Topological Snapping (`js/vectorizer.js`):**
  * 8-connected **Moore-Neighbor contour tracing** with minimum-area speckle rejection.
  * **Ramer-Douglas-Peucker (RDP)** polyline simplification to convert pixel staircases into smooth vector boundaries.
  * Spatial-hash grid vertex snapping (`1.6px` radius) to enforce shared boundaries between adjacent thematic classes and prevent topological slivers.
* **High-Precision Island Vector Injection (`js/geojsonExporter.js`):**
  * Bypasses low-resolution raster artifacts on oceanic islands (`INLD`, `INAN`) and injects pre-simplified vector geometries dynamically partitioned across the **Ten Degree Channel (10°N)**.

## Architecture

```text
├── index.html              # Workbench UI & calibration controls
├── css/style.css           # Dark-mode GIS layout & responsive canvas viewport
├── data/india.geojson      # Reference CRS:84 boundary & island vector source
└── js/
    ├── app.js              # Master controller, rapid eyedropper & pipeline orchestration
    ├── canvas.js           # Pan/zoom viewport, bounding-box & 10-pin TPS crosshair UI
    ├── transform.js        # 10-anchor Thin Plate Spline forward/inverse matrix solver
    ├── colorExtractor.js   # Perceptual RGB segmentation & dilated line-stroke masking
    ├── morphology.js       # Morphological open/close & multi-source BFS Voronoi seam healing
    ├── vectorizer.js       # Moore-Neighbor contour tracer, RDP simplifier & vertex snapper
    └── geojsonExporter.js  # CRS:84 MultiPolygon serializer & idempotent island injector
```

## Active Development Roadmap (v2.0)

- [ ] **Interior Hole Topology (Winding Order & Containment Hierarchy):** Upgrade `mooreTrace` and `GeoJsonExporter` to detect enclosed child contours and serialize them as proper GeoJSON interior holes rather than overlapping exterior rings.
- [ ] **Web Worker Offloading:** Move synchronous pixel-grid morphological operations and BFS seam healing off the main UI thread into background Web Workers with progress streaming for 4K+ map scans.
- [ ] **Perceptual Color Space (CIELAB Delta-E):** Replace weighted RGB distance with CIELAB color matching and K-Means auto-clustering for degraded historical map scans.
- [ ] **Sub-National / State-Level Calibration Profiles:** Generalize `INDIA_ANCHORS` and landmask clipping to support arbitrary state/district reference GeoJSONs.
- [ ] **Automated Test Suite & CLI Batch Runner:** Add Vitest unit tests for TPS matrix inversion, RDP ring closure, and topological snapping.

## License

MIT License
