// The two quality presets. Everything that costs speed is controlled here.
export const QUALITY = {
  LOW: {
    name: "LOW",
    pixelRatioCap: 1,
    grassDensityScale: 0.25, // a quarter of the blades
    bladeSegments: 2, // simpler blades (3 triangles each)
    bladeWidthScale: 1.6, // wider blades so fewer of them still look full
    groundSegments: 96,
  },
  HIGH: {
    name: "HIGH",
    pixelRatioCap: 2,
    grassDensityScale: 1,
    bladeSegments: 3, // 5 triangles each
    bladeWidthScale: 1,
    groundSegments: 192,
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