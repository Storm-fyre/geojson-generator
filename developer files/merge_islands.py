import json
import math

# ----------------------------------------------------
# Settings:
# PRECISION = 2: Matches the 2 decimals in your OG 5 features
# EPSILON = 0.005: Tolerance in degrees (~500m), removes
#                  stair-step micro-vertices along coastlines
# ----------------------------------------------------
PRECISION = 2
EPSILON = 0.005


def point_line_distance(pt, start, end):
    """Calculate perpendicular distance from a point to a line segment."""
    x, y = pt
    x1, y1 = start
    x2, y2 = end
    dx = x2 - x1
    dy = y2 - y1
    if dx == 0 and dy == 0:
        return math.hypot(x - x1, y - y1)
    return abs(dy * x - dx * y + x2 * y1 - y2 * x1) / math.hypot(dx, dy)


def rdp(points, epsilon):
    """Ramer-Douglas-Peucker line simplification."""
    if len(points) < 3:
        return points
    dmax = 0.0
    index = 0
    end = len(points) - 1
    for i in range(1, end):
        d = point_line_distance(points[i], points[0], points[end])
        if d > dmax:
            index = i
            dmax = d
    if dmax > epsilon:
        rec1 = rdp(points[: index + 1], epsilon)
        rec2 = rdp(points[index:], epsilon)
        return rec1[:-1] + rec2
    else:
        return [points[0], points[end]]


def simplify_ring(ring, epsilon, precision):
    """Rounds, deduplicates, simplifies via RDP, and ensures ring closure."""
    # 1. Round and remove immediate duplicates
    deduped = []
    for pt in ring:
        rounded = [round(pt[0], precision), round(pt[1], precision)]
        if not deduped or rounded != deduped[-1]:
            deduped.append(rounded)

    if len(deduped) < 4:
        return None

    # 2. For closed rings, split at farthest point before applying RDP
    start = deduped[0]
    farthest_idx = 0
    max_d = 0.0
    for i, pt in enumerate(deduped[:-1]):
        d = math.hypot(pt[0] - start[0], pt[1] - start[1])
        if d > max_d:
            max_d = d
            farthest_idx = i

    if farthest_idx == 0 or farthest_idx == len(deduped) - 1:
        farthest_idx = len(deduped) // 2

    arc1 = rdp(deduped[: farthest_idx + 1], epsilon)
    arc2 = rdp(deduped[farthest_idx:], epsilon)
    simplified = arc1[:-1] + arc2

    # 3. Final cleanup and enforce valid closed ring
    final_ring = []
    for p in simplified:
        rounded = [round(p[0], precision), round(p[1], precision)]
        if not final_ring or rounded != final_ring[-1]:
            final_ring.append(rounded)

    if len(final_ring) > 1 and final_ring[0] != final_ring[-1]:
        final_ring.append(final_ring[0])

    return final_ring if len(final_ring) >= 4 else None


def merge_physiographic_divisions():
    # 1. Load states file
    with open("india.geojson", "r", encoding="utf-8") as f:
        india_data = json.load(f)

    lakshadweep_geom = None
    andaman_geom = None

    for feature in india_data.get("features", []):
        props = feature.get("properties", {})
        feat_id = props.get("id", "")
        feat_name = props.get("name", "").lower()

        if feat_id == "INLD" or "lakshadweep" in feat_name:
            lakshadweep_geom = feature.get("geometry", {})
        if feat_id == "INAN" or "andaman" in feat_name:
            andaman_geom = feature.get("geometry", {})

    def extract_polygons(geom):
        g_type = geom.get("type", "")
        coords = geom.get("coordinates", [])
        if g_type == "MultiPolygon":
            return coords
        elif g_type == "Polygon":
            return [coords]
        return []

    raw_polygons = extract_polygons(lakshadweep_geom) + extract_polygons(
        andaman_geom
    )

    # 2. Simplify all island polygon rings
    total_raw_pts = sum(len(ring) for poly in raw_polygons for ring in poly)

    simplified_polygons = []
    for poly in raw_polygons:
        simplified_poly = []
        for ring in poly:
            s_ring = simplify_ring(
                ring, epsilon=EPSILON, precision=PRECISION
            )
            if s_ring:
                simplified_poly.append(s_ring)
        if simplified_poly:
            simplified_polygons.append(simplified_poly)

    total_simplified_pts = sum(
        len(ring) for poly in simplified_polygons for ring in poly
    )
    print(
        f"✓ Reduced island points from {total_raw_pts} down to {total_simplified_pts} "
        f"({round((1 - total_simplified_pts/total_raw_pts) * 100, 1)}% reduction)."
    )

    # 3. Assemble the 6th feature
    islands_feature = {
        "type": "Feature",
        "geometry": {
            "type": "MultiPolygon",
            "coordinates": simplified_polygons,
        },
        "properties": {
            "class_key": "the_islands",
            "name": "The Islands",
            "color": "#7b1fa2",
            "sub_divisions": "Arabian Sea Group: Lakshadweep (Amindivi, Laccadive, and Minicoy islands, separated by the 9° and 8° channels). Bay of Bengal Group: Andaman and Nicobar (Great Andaman, Little Andaman, Car Nicobar, and Great Nicobar, separated by the 10° Channel and Duncan Passage).",
            "geological_origin": "Contrasted origins: Lakshadweep represents coral reef atolls built atop the submerged Chagos-Laccadive submarine ridge; Andaman and Nicobar represent subaerial summits of an elevated Tertiary fold mountain accretionary prism (continuation of the Arakan Yoma range), accompanied by active/dormant volcanic centers (Barren Island, Narcondam).",
            "relief_and_topography": "Lakshadweep consists of flat, low-lying coral atolls rarely exceeding 2–5 m elevation above sea level, surrounded by shallow lagoons and fringing reefs. Andaman and Nicobar display rugged, undulating mountainous terrain, sharp ridges, narrow valleys, and coastal cliffs rising to Saddle Peak (732 m).",
            "drainage_and_rivers": "Lakshadweep completely lacks surface streams or rivers, relying solely on fragile subterranean Ghyben-Herzberg freshwater lenses. Andaman and Nicobar feature short, fast-flowing streams, along with perennial drainage networks on Great Nicobar (Galathea, Alexandra, Amrit Kaur) and North Andaman (Kalpong River).",
            "distinctive_features": "Houses South Asia's only active volcano (Barren Island), India's southernmost territorial point (Indira Point), hyper-diverse coral reefs, equatorial/tropical rainforest biomes, and protected indigenous tribal reserves (Sentinelese, Jarawa, Onge, Shompen).",
            "economic_significance": "Geostrategic maritime oversight guarding the western entrance to the Malacca Strait; major expansion of India's Exclusive Economic Zone (EEZ); deep-sea marine exploration, tuna fisheries, high-value eco-tourism, and coconut/coir agro-industries.",
            "states_covered": [
                "Lakshadweep",
                "Andaman and Nicobar Islands",
            ],
        },
    }

    # 4. Load base file and append / replace 6th feature
    with open("physiographic_divisions.geojson", "r", encoding="utf-8") as f:
        master_data = json.load(f)

    if len(master_data["features"]) >= 6:
        master_data["features"][5] = islands_feature
    else:
        master_data["features"].append(islands_feature)

    # 5. Save with exact hybrid layout (1 line per feature)
    output_filename = "physiographic_divisions_complete.geojson"
    with open(output_filename, "w", encoding="utf-8") as f:
        f.write("{\n")
        f.write('  "type": "FeatureCollection",\n')
        f.write(
            f'  "name": "{master_data.get("name", "PHYSIOGRAPHIC_DIVISIONS")}",\n'
        )
        if "crs" in master_data:
            f.write(f'  "crs": {json.dumps(master_data["crs"])},\n')
        f.write('  "features": [\n')

        feature_rows = [
            "    "
            + json.dumps(feat, separators=(",", ":"), ensure_ascii=False)
            for feat in master_data["features"]
        ]
        f.write(",\n".join(feature_rows) + "\n")

        f.write("  ]\n")
        f.write("}\n")

    print(
        f"✓ Successfully generated '{output_filename}' with lightweight geometry and clean line formatting!"
    )


if __name__ == "__main__":
    merge_physiographic_divisions()