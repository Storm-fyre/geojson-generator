/**
 * GeoJSON Assembler & Serializer
 * Outputs CRS:84 compliant FeatureCollection matching the project schema.
 */

export class GeoJsonExporter {
  /**
   * Assemble complete FeatureCollection
   * @param {Array} soilFeatures - Array of features generated per soil type
   * @returns {Object} Standard GeoJSON object
   */
  static buildFeatureCollection(soilFeatures) {
    return {
      type: "FeatureCollection",
      name: "INDIA_SOIL_MAP_NCERT",
      crs: {
        type: "name",
        properties: {
          name: "urn:ogc:def:crs:OGC:1.3:CRS84"
        }
      },
      features: soilFeatures
    };
  }

  /**
   * Build a single Feature entry for a soil category
   * Disjoint patches are packed into a MultiPolygon geometry.
   * @param {string} soilKey - The identifier key (e.g. "black", "alluvial")
   * @param {Object} metadata - The attributes from soil_properties.json
   * @param {Array} polygonRings - Array of simplified rings in pixel coords
   * @param {Object} geoTransform - GeoTransform instance for pixel->geo projection
   */
  static createSoilFeature(soilKey, metadata, polygonRings, geoTransform) {
    if (!polygonRings || polygonRings.length === 0) return null;

    // Convert pixel coordinate rings to real [longitude, latitude]
    const multiPolygonCoordinates = [];

    for (const ring of polygonRings) {
      if (ring.length < 4) continue;
      const geoRing = [];

      for (const pt of ring) {
        const [lon, lat] = geoTransform.pixelToGeo(pt.x, pt.y);
        // Retain 2 decimal place precision matching your reference files
        geoRing.push([
          parseFloat(lon.toFixed(2)),
          parseFloat(lat.toFixed(2))
        ]);
      }

      // GeoJSON spec requires the first and last position to be identical
      const first = geoRing[0];
      const last = geoRing[geoRing.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) {
        geoRing.push([first[0], first[1]]);
      }

      // In standard GeoJSON, a Polygon is an array of LinearRings [outer, ...holes]
      multiPolygonCoordinates.push([geoRing]);
    }

    if (multiPolygonCoordinates.length === 0) return null;

    // Build the Feature adhering to your exact schema with properties at the end
    return {
      type: "Feature",
      geometry: {
        type: "MultiPolygon",
        coordinates: multiPolygonCoordinates
      },
      properties: {
        soil_key: soilKey,
        name: metadata.name || soilKey,
        color: metadata.color || "#000000",
        sub_type: metadata.sub_type || "",
        geological_origin: metadata.geological_origin || "",
        texture: metadata.texture || "",
        chemical_profile: metadata.chemical_profile || "",
        distinctive_features: metadata.distinctive_features || "",
        major_crops: metadata.major_crops || "",
        states_covered: metadata.states_covered || []
      }
    };
  }

  /**
   * Trigger browser file download for a GeoJSON object
   */
  static downloadJson(jsonObject, filename = "soils.geojson") {
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