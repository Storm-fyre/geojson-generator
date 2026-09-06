/**
 * Universal Thematic GeoJSON Assembler & Serializer
 * Outputs CRS:84 compliant FeatureCollection with dynamic metadata passthrough.
 */

export class GeoJsonExporter {
  /**
   * Assemble complete FeatureCollection
   * @param {Array} features - Array of features generated per category
   * @param {string} themeName - Identifier name for collection
   */
  static buildFeatureCollection(features, themeName = "THEMATIC_MAP") {
    return {
      type: "FeatureCollection",
      name: themeName.toUpperCase(),
      crs: {
        type: "name",
        properties: {
          name: "urn:ogc:def:crs:OGC:1.3:CRS84"
        }
      },
      features: features
    };
  }

  /**
   * Build a single Feature entry for any thematic category.
   * Dynamically forwards all attributes from the metadata JSON.
   */
  static createThematicFeature(classKey, metadata, polygonRings, geoTransform) {
    if (!polygonRings || polygonRings.length === 0) return null;

    const multiPolygonCoordinates = [];

    for (const ring of polygonRings) {
      if (ring.length < 4) continue;
      const geoRing = [];

      for (const pt of ring) {
        const [lon, lat] = geoTransform.pixelToGeo(pt.x, pt.y);
        geoRing.push([
          parseFloat(lon.toFixed(2)),
          parseFloat(lat.toFixed(2))
        ]);
      }

      // Ensure closed LinearRing
      const first = geoRing[0];
      const last = geoRing[geoRing.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) {
        geoRing.push([first[0], first[1]]);
      }

      multiPolygonCoordinates.push([geoRing]);
    }

    if (multiPolygonCoordinates.length === 0) return null;

    // Dynamically forward all metadata properties
    const properties = {
      class_key: classKey,
      name: metadata.name || classKey,
      color: metadata.color || "#000000"
    };

    // Forward any additional custom attributes present in the loaded JSON
    for (const prop in metadata) {
      if (!properties.hasOwnProperty(prop)) {
        properties[prop] = metadata[prop];
      }
    }

    return {
      type: "Feature",
      geometry: {
        type: "MultiPolygon",
        coordinates: multiPolygonCoordinates
      },
      properties: properties
    };
  }

  /**
   * Trigger browser file download for a GeoJSON object
   */
  static downloadJson(jsonObject, filename = "thematic_map.geojson") {
    const jsonString = JSON.stringify(jsonObject);
    const blob = new Blob([jsonString], { type: "application/geo+json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}