// The two quality presets. Everything that costs speed is controlled here.
export const QUALITY = {
  LOW: {
    name: "LOW",
    pixelRatioCap: 1,
    grassDensityScale: 0.25, // a quarter of the blades
    bladeSegments: 2, // simpler blades (3 triangles each)
    bladeWidthScale: 1.6, // wider blades so fewer of them still look full
    groundSegments: 15, // ground detail per 60 m chunk (one point every 4 m)
    treeDetail: 0, // simplest tree shapes
    landmarkSegments: 36, // mountain detail (grid squares per side)
    // Tile ring radii in metres, ordered for LOD 64, 32, 16 and 8.
    // Reduced from the initial targets to keep LOW near the 150k triangle budget.
    terrainRings: [200, 500, 1000, 2000],
    terrainFarStride: 2, // every second far sample: 126 x 126 vertices
    terrainTriangleBudget: 150000,
    vegetationRadius: 300,
    vegetationTriangleBudget: 60000,
    vegetationDensityScale: 0.7,
    vegetationNearFadeStart: 60,
    vegetationNearEnd: 100,
    vegetationMidEnd: 220,
    vegetationMidFadeEnd: 280,
    vegetationFadeWidth: 35,
    resourceRadius: 300,
    resourceChunkCacheLimit: 48,
    waterRiverRadius: 600,
  },
  HIGH: {
    name: "HIGH",
    pixelRatioCap: 2,
    grassDensityScale: 1,
    bladeSegments: 3, // 5 triangles each
    bladeWidthScale: 1,
    groundSegments: 30, // one point every 2 m
    treeDetail: 1,
    landmarkSegments: 64,
    // Initial target radii; expected startup terrain total is about 392k triangles.
    terrainRings: [375, 875, 1750, 3500],
    terrainFarStride: 1, // full 251 x 251 far grid
    terrainTriangleBudget: 400000,
    vegetationRadius: 700,
    vegetationTriangleBudget: 150000,
    vegetationDensityScale: 1,
    vegetationNearFadeStart: 60,
    vegetationNearEnd: 100,
    vegetationMidEnd: 220,
    vegetationMidFadeEnd: 280,
    vegetationFadeWidth: 35,
    resourceRadius: 700,
    resourceChunkCacheLimit: 96,
    waterRiverRadius: 1200,
  },
};

export function isTouchDevice() {
  return navigator.maxTouchPoints > 0 || window.matchMedia("(pointer: coarse)").matches;
}

// Phones and tablets start on LOW. Everything else starts on HIGH.
export function pickStartingQuality() {
  return isTouchDevice() ? QUALITY.LOW : QUALITY.HIGH;
}

export function nextQuality(current) {
  return current.name === "HIGH" ? QUALITY.LOW : QUALITY.HIGH;
}