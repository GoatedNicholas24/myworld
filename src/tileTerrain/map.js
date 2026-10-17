const WORLD_SIZE = 20000;
const WORLD_HALF = WORLD_SIZE / 2;
const LANDMARKS = [
  ["Rwenzori-like Range", 10, 3],
  ["Northern Highlands", 4, 4],
  ["Eastern Highlands", 17, 6],
  ["Western Plateau", 3, 10],
  ["Central Valley", 10, 10],
  ["Rift Escarpment", 17, 11],
  ["Savannah Plains", 5, 17],
  ["Southern Hills", 9, 16],
  ["Forest Plateau", 15, 18],
];

function cssRgb(hex) {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function makeBackground(size, metadata, heights, biomes) {
  const base = document.createElement("canvas");
  base.width = size;
  base.height = size;
  const ctx = base.getContext("2d");
  const image = ctx.createImageData(size, size);
  const colors = metadata.biomes.map((biome) => cssRgb(biome.paint));
  const samples = 251;
  for (let y = 0; y < size; y += 1) {
    const row = Math.min(samples - 1, Math.round((y / (size - 1)) * (samples - 1)));
    for (let x = 0; x < size; x += 1) {
      const col = Math.min(samples - 1, Math.round((x / (size - 1)) * (samples - 1)));
      const index = row * samples + col;
      const [r, g, b] = colors[biomes[index]] ?? [139, 138, 104];
      const elevation = 900 + (heights[index] / 65535) * 4400;
      const shade = 0.82 + ((elevation - 900) / 4400) * 0.24;
      const pixel = (y * size + x) * 4;
      image.data[pixel] = Math.min(255, r * shade);
      image.data[pixel + 1] = Math.min(255, g * shade);
      image.data[pixel + 2] = Math.min(255, b * shade);
      image.data[pixel + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  ctx.strokeStyle = "rgba(35, 38, 30, 0.45)";
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, size - 1, size - 1);
  return base;
}

export function createGreatLakesMapView({ camera, metadata, farHeights, farBiomes }) {
  const mapSize = 640;
  const miniSize = 180;
  const background = makeBackground(mapSize, metadata, farHeights, farBiomes);
  const miniBackground = makeBackground(miniSize, metadata, farHeights, farBiomes);
  const root = document.createElement("div");
  root.id = "great-lakes-map-ui";
  root.innerHTML = `
    <div class="gl-minimap"><canvas class="gl-map-base"></canvas><canvas class="gl-map-dynamic"></canvas></div>
    <div class="gl-fullmap" hidden><div class="gl-fullmap-panel">
      <div class="gl-map-heading"><strong>Great Lakes Region · 20 × 20 km</strong><button type="button" class="gl-map-close">×</button></div>
      <div class="gl-fullmap-stack"><canvas class="gl-map-base"></canvas><canvas class="gl-map-dynamic"></canvas></div>
      <p>North is up · M closes map · N toggles minimap</p>
    </div></div>`;
  document.body.append(root);

  const mini = root.querySelector(".gl-minimap");
  const full = root.querySelector(".gl-fullmap");
  const fullStack = root.querySelector(".gl-fullmap-stack");
  const miniBase = mini.querySelector(".gl-map-base");
  const miniDynamic = mini.querySelector(".gl-map-dynamic");
  const fullBase = fullStack.querySelector(".gl-map-base");
  const fullDynamic = fullStack.querySelector(".gl-map-dynamic");
  for (const [canvas, size] of [[miniBase, miniSize], [miniDynamic, miniSize], [fullBase, mapSize], [fullDynamic, mapSize]]) {
    canvas.width = size;
    canvas.height = size;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
  }
  miniBase.getContext("2d").drawImage(miniBackground, 0, 0);
  fullBase.getContext("2d").drawImage(background, 0, 0);

  const fullCtx = fullBase.getContext("2d");
  const point = (xKm, zKm, size) => [((xKm * 1000) / WORLD_SIZE) * size, ((zKm * 1000) / WORLD_SIZE) * size];
  fullCtx.font = "12px system-ui, sans-serif";
  fullCtx.textBaseline = "middle";
  for (const [name, xKm, southKm] of LANDMARKS) {
    const [x, y] = point(xKm, southKm, mapSize);
    fullCtx.fillStyle = "rgba(255, 248, 225, 0.88)";
    fullCtx.beginPath();
    fullCtx.arc(x, y, 3, 0, Math.PI * 2);
    fullCtx.fill();
    fullCtx.strokeStyle = "rgba(30, 35, 27, 0.85)";
    fullCtx.stroke();
    fullCtx.lineWidth = 3;
    fullCtx.strokeText(name, x + 7, y - 6, 130);
    fullCtx.lineWidth = 1;
    fullCtx.fillStyle = "#1f2a20";
    fullCtx.fillText(name, x + 7, y - 6, 130);
  }
  fullCtx.fillStyle = "#f9f0d8";
  fullCtx.strokeStyle = "#26342b";
  fullCtx.lineWidth = 3;
  fullCtx.strokeText("N ↑", mapSize - 45, 20);
  fullCtx.fillText("N ↑", mapSize - 45, 20);
  fullCtx.lineWidth = 2;
  fullCtx.beginPath();
  fullCtx.moveTo(14, mapSize - 22);
  fullCtx.lineTo(78, mapSize - 22);
  fullCtx.stroke();
  fullCtx.font = "11px system-ui, sans-serif";
  fullCtx.strokeText("2 km", 14, mapSize - 34);
  fullCtx.fillText("2 km", 14, mapSize - 34);

  let minimapVisible = true;
  let fullVisible = false;
  function toggleMinimap() {
    minimapVisible = !minimapVisible;
    mini.hidden = !minimapVisible;
  }
  function toggleFull() {
    fullVisible = !fullVisible;
    full.hidden = !fullVisible;
  }
  root.querySelector(".gl-map-close").addEventListener("click", () => { fullVisible = false; full.hidden = true; });
  window.addEventListener("keydown", (event) => {
    if (event.repeat) return;
    if (event.code === "KeyN") toggleMinimap();
    if (event.code === "KeyM") toggleFull();
    if (event.code === "Escape" && fullVisible) { fullVisible = false; full.hidden = true; }
  });

  function drawDynamic(canvas, size, showViewport) {
    if (canvas.width !== size) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, size, size);
    const x = ((camera.position.x + WORLD_HALF) / WORLD_SIZE) * size;
    const z = ((camera.position.z + WORLD_HALF) / WORLD_SIZE) * size;
    if (showViewport) {
      // Approximate the view footprint as a cheap 600 m box.
      const side = (600 / WORLD_SIZE) * size;
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x - side / 2, z - side / 2, side, side);
    }
    ctx.save();
    ctx.translate(x, z);
    ctx.rotate(-camera.rotation.y);
    ctx.fillStyle = "#d23d2e";
    ctx.strokeStyle = "#fff5dc";
    ctx.lineWidth = Math.max(1, size / 180);
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.027);
    ctx.lineTo(size * 0.018, size * 0.018);
    ctx.lineTo(0, size * 0.009);
    ctx.lineTo(-size * 0.018, size * 0.018);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function update() {
    if (minimapVisible) drawDynamic(miniDynamic, miniSize, false);
    if (fullVisible) drawDynamic(fullDynamic, mapSize, true);
  }
  update();
  return { update, dispose() { root.remove(); } };
}
