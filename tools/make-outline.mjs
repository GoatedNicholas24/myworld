// Makes the Karamoja outline for the map from a boundary file (GeoJSON).
//
// 1. Download a Uganda boundary file (free, CC BY 4.0), for example:
//    - "Uganda - Subregion Boundaries (2014)" on https://energydata.info/dataset/subregion-boundaries-2014
//    - or Uganda district boundaries from https://www.geoboundaries.org (UGA, ADM2)
//    Save it as data/boundaries.geojson (the data/ folder is ignored by git).
// 2. Run:  node tools/make-outline.mjs data/boundaries.geojson
// 3. It writes worlds/karamoja/outline.json, and the map picks it up.

import { readFileSync, writeFileSync } from "node:fs";

const [file, worldId = "karamoja"] = process.argv.slice(2);
if (!file) {
  console.log("Usage: node tools/make-outline.mjs <boundaries.geojson> [world-id]");
  process.exit(1);
}

const DISTRICTS = new Set([
  "abim", "amudat", "kaabong", "karenga", "kotido",
  "moroto", "nabilatuk", "nakapiripirit", "napak",
]);

const data = JSON.parse(readFileSync(file, "utf8"));
const features = data.features ?? [];

const matches = (feature, test) =>
  Object.values(feature.properties ?? {}).some(
    (value) => typeof value === "string" && test(value.trim().toLowerCase()),
  );

// First look for a "Karamoja" feature; otherwise use the nine Karamoja districts.
let picked = features.filter((f) => matches(f, (v) => v === "karamoja"));
let how = "sub-region boundary";
if (picked.length === 0) {
  picked = features.filter((f) => matches(f, (v) => DISTRICTS.has(v.replace(/ district$/, ""))));
  how = "district boundaries";
}
if (picked.length === 0) {
  console.log('Could not find "Karamoja" or its districts in that file.');
  console.log("The first feature's properties look like this:", features[0]?.properties);
  process.exit(1);
}

// Douglas-Peucker: removes points that barely change the shape.
function simplify(points, tolerance) {
  if (points.length < 3) return points;
  const [ax, ay] = points[0];
  const [bx, by] = points[points.length - 1];
  const length = Math.hypot(bx - ax, by - ay) || 1e-12;
  let maxDistance = 0;
  let index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i];
    const distance = Math.abs((by - ay) * px - (bx - ax) * py + bx * ay - by * ax) / length;
    if (distance > maxDistance) {
      maxDistance = distance;
      index = i;
    }
  }
  if (maxDistance <= tolerance) return [points[0], points[points.length - 1]];
  const left = simplify(points.slice(0, index + 1), tolerance);
  const right = simplify(points.slice(index), tolerance);
  return [...left.slice(0, -1), ...right];
}

const polygons = [];
for (const feature of picked) {
  const geometry = feature.geometry;
  const outerRings =
    geometry.type === "Polygon"
      ? [geometry.coordinates[0]]
      : geometry.type === "MultiPolygon"
        ? geometry.coordinates.map((polygon) => polygon[0])
        : [];
  for (const ring of outerRings) {
    const middle = Math.floor(ring.length / 2); // a ring starts and ends at the same point, so simplify it in two halves
    const simple = [...simplify(ring.slice(0, middle + 1), 0.008).slice(0, -1), ...simplify(ring.slice(middle), 0.008)];
    polygons.push(simple.map(([lon, lat]) => [Number(lon.toFixed(3)), Number(lat.toFixed(3))]));
  }
}

writeFileSync(
  `worlds/${worldId}/outline.json`,
  JSON.stringify({ source: `${how} from ${file}, simplified`, polygons }),
);
console.log(`Wrote worlds/${worldId}/outline.json (${picked.length} feature(s), ${polygons.length} outline(s), ${how}).`);