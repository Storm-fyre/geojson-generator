/**
 * Universal Thematic GeoJSON Assembler & Serializer
 * Outputs CRS:84 compliant FeatureCollection with each entity on its own line.
 * Injects simplified island vector geometries into designated thematic classes idempotently.
 */

export class GeoJsonExporter {
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
   * Converts pixel coordinate rings to WGS84 GeoJSON MultiPolygon.
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

    const properties = {
      class_key: classKey,
      name: metadata.name || classKey,
      color: metadata.color || "#000000"
    };

    // Dynamically forward any custom attributes from the metadata JSON
    for (const prop in metadata) {
      if (!properties.hasOwnProperty(prop) && prop !== 'isIgnored') {
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
   * Injects high-precision simplified island vector geometries into the selected classes.
   * Uses safe coordinate cloning so multiple exports never create duplicate island shapes.
   */
  static injectIslandsIntoFeatures(features, islandAssignments, islandGeomsMap, thematicMetadata) {
    // Deep clone features and their coordinate arrays to ensure 100% idempotent exports
    const updatedFeatures = features.map(f => ({
      ...f,
      geometry: {
        ...f.geometry,
        coordinates: [...f.geometry.coordinates]
      },
      properties: { ...f.properties }
    }));

    for (const islandKey of ['andaman', 'nicobar', 'lakshadweep']) {
      const targetClassKey = islandAssignments[islandKey];
      if (!targetClassKey) continue;

      const islandPolys = islandGeomsMap[islandKey];
      if (!islandPolys || islandPolys.length === 0) continue;

      const existingFeature = updatedFeatures.find(f => f.properties && f.properties.class_key === targetClassKey);

      if (existingFeature) {
        existingFeature.geometry.coordinates.push(...islandPolys);
      } else {
        // Create dedicated feature for this class if only present on islands (e.g. Sundaland)
        const meta = thematicMetadata[targetClassKey] || { name: targetClassKey, color: "#7b1fa2" };
        const properties = {
          class_key: targetClassKey,
          name: meta.name || targetClassKey,
          color: meta.color || "#000000"
        };
        for (const prop in meta) {
          if (!properties.hasOwnProperty(prop) && prop !== 'isIgnored') {
            properties[prop] = meta[prop];
          }
        }

        updatedFeatures.push({
          type: "Feature",
          geometry: {
            type: "MultiPolygon",
            coordinates: [...islandPolys]
          },
          properties: properties
        });
      }
    }

    return updatedFeatures;
  }

  /**
   * Formats the FeatureCollection so that each Feature entity occupies
   * exactly one dedicated line (matching python merge_islands.py output).
   */
  static formatPerEntityJson(jsonObject) {
    if (!jsonObject || jsonObject.type !== "FeatureCollection" || !Array.isArray(jsonObject.features)) {
      return JSON.stringify(jsonObject, null, 2);
    }

    const header = `{\n  "type": "FeatureCollection",\n  "name": ${JSON.stringify(jsonObject.name || "THEMATIC_MAP")},\n  "crs": ${JSON.stringify(jsonObject.crs || {})},\n  "features": [\n`;
    
    const featureLines = jsonObject.features
      .map(feat => `    ${JSON.stringify(feat)}`)
      .join(',\n');
      
    const footer = `\n  ]\n}\n`;

    return header + featureLines + footer;
  }

  static downloadJson(jsonObject, filename = "thematic_map.geojson") {
    const formattedString = this.formatPerEntityJson(jsonObject);
    const blob = new Blob([formattedString], { type: "application/geo+json;charset=utf-8" });
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