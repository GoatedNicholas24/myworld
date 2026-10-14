// The map icon (top right) and the map screen. Open it with the icon or M.
// Everything is drawn with plain 2D canvas from worlds/<name>/map.json.

const COLORS = {
  paper: "#efe4cc",
  land: "#e3d2aa",
  border: "#8a6d3b",
  grid: "rgba(90, 70, 40, 0.14)",
  river: "#4f87a8",
  road: "#a06a3b",
  mountain: "#6b5b45",
  town: "#3a2f22",
  park: "#6f8f3f",
  player: "#c0392b",
  text: "#3a2f22",
};

const ICON = `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 4 3 6.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5z"/><path d="M9 4v13.5M15 6.5V20"/></svg>`;

export function createMapView({ map, outline, geo, camera, title }) {
  const rings = outline ? outline.polygons : [];
  const towns = new Map(map.towns.map((town) => [town.name, town]));

  // The frame of the map: everything we draw, plus a margin.
  const lats = [map.start.lat];
  const lons = [map.start.lon];
  for (const item of [...map.towns, ...map.mountains, ...map.parks]) {
    lats.push(item.lat);
    lons.push(item.lon);
  }
  for (const ring of rings) {
    for (const [lon, lat] of ring) {
      lats.push(lat);
      lons.push(lon);
    }
  }
  const margin = 0.15;
  const minLat = Math.min(...lats) - margin;
  const maxLat = Math.max(...lats) + margin;
  const minLon = Math.min(...lons) - margin;
  const maxLon = Math.max(...lons) + margin;
  const midLat = (minLat + maxLat) / 2;
  const aspect = ((maxLon - minLon) * Math.cos((midLat * Math.PI) / 180)) / (maxLat - minLat);

  // ---- The icon and the screen ----
  const button = document.createElement("button");
  button.id = "map-button";
  button.type = "button";
  button.title = "Map (M)";
  button.setAttribute("aria-label", "Open map");
  button.innerHTML = ICON;

  const overlay = document.createElement("div");
  overlay.id = "map-overlay";
  overlay.hidden = true;
  overlay.innerHTML =
    `<div class="map-panel">` +
    `<h2><span>${title} · map</span><button type="button" class="map-close" aria-label="Close map">×</button></h2>` +
    `<canvas></canvas><p></p></div>`;
  document.body.append(button, overlay);

  const canvas = overlay.querySelector("canvas");
  const note = overlay.querySelector("p");
  const ctx = canvas.getContext("2d");

  note.textContent =
    (rings.length
      ? `Outline: ${outline.source}. `
      : "Region outline not loaded yet (see tools/make-outline.mjs). ") +
    `${map.source} Press M or Esc to close.`;

  // ---- Drawing ----
  let size = { w: 0, h: 0, dpr: 0 };
  let open = false;
  let timer = null;

  function draw() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(200, Math.min(window.innerWidth * 0.92 - 24, window.innerHeight * 0.72 * aspect));
    const h = w / aspect;
    if (size.w !== w || size.h !== h || size.dpr !== dpr) {
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      size = { w, h, dpr };
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const project = (lat, lon) => [
      ((lon - minLon) / (maxLon - minLon)) * w,
      ((maxLat - lat) / (maxLat - minLat)) * h,
    ];
    const label = (text, x, y, side = "right") => {
      ctx.textAlign = side === "left" ? "right" : "left";
      ctx.fillText(text, x + (side === "left" ? -9 : 9), y + 4);
    };

    ctx.fillStyle = COLORS.paper;
    ctx.fillRect(0, 0, w, h);

    // Grid lines every half degree.
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    for (let lat = Math.ceil(minLat * 2) / 2; lat <= maxLat; lat += 0.5) {
      const [, y] = project(lat, minLon);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    for (let lon = Math.ceil(minLon * 2) / 2; lon <= maxLon; lon += 0.5) {
      const [x] = project(minLat, lon);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    // Region outline (if the outline file exists).
    ctx.fillStyle = COLORS.land;
    ctx.strokeStyle = COLORS.border;
    ctx.lineWidth = 1.5;
    for (const ring of rings) {
      ctx.beginPath();
      ring.forEach(([lon, lat], i) => {
        const [x, y] = project(lat, lon);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // Roads.
    ctx.strokeStyle = COLORS.road;
    ctx.lineWidth = 1.6;
    ctx.setLineDash([]);
    for (const [fromName, toName] of map.roads) {
      const a = towns.get(fromName);
      const b = towns.get(toName);
      if (!a || !b) continue;
      const [ax, ay] = project(a.lat, a.lon);
      const [bx, by] = project(b.lat, b.lon);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
    }

    // Rivers (dashed when only roughly known).
    ctx.strokeStyle = COLORS.river;
    ctx.lineWidth = 2;
    for (const river of map.rivers) {
      ctx.setLineDash(river.schematic ? [6, 5] : []);
      ctx.beginPath();
      river.points.forEach(([lon, lat], i) => {
        const [x, y] = project(lat, lon);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
    ctx.setLineDash([]);

    ctx.font = "12px system-ui, sans-serif";
    ctx.fillStyle = COLORS.text;

    // National park.
    for (const park of map.parks) {
      const [x, y] = project(park.lat, park.lon);
      ctx.fillStyle = "rgba(111, 143, 63, 0.35)";
      ctx.strokeStyle = COLORS.park;
      ctx.beginPath();
      ctx.arc(x, y, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = COLORS.text;
      label(park.name, x, y, park.side);
    }

    // Mountains.
    for (const mountain of map.mountains) {
      const [x, y] = project(mountain.lat, mountain.lon);
      ctx.fillStyle = COLORS.mountain;
      ctx.beginPath();
      ctx.moveTo(x, y - 8);
      ctx.lineTo(x + 8, y + 5);
      ctx.lineTo(x - 8, y + 5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = COLORS.text;
      label(`${mountain.name} ${mountain.elevation.toLocaleString()} m`, x, y, mountain.side);
    }

    // Towns.
    for (const town of map.towns) {
      const [x, y] = project(town.lat, town.lon);
      ctx.fillStyle = COLORS.town;
      ctx.beginPath();
      ctx.arc(x, y, town.major ? 5 : 3.5, 0, Math.PI * 2);
      ctx.fill();
      label(town.name, x, y, town.side);
    }

    // The area you can walk in, and you.
    const [sx, sy] = project(map.start.lat, map.start.lon);
    ctx.strokeStyle = COLORS.player;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(sx, sy, 10, 0, Math.PI * 2);
    ctx.stroke();

    const here = geo.toGeo(camera.position.x, camera.position.z);
    const [px, py] = project(here.lat, here.lon);
    const yaw = camera.rotation.y;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(Math.atan2(-Math.cos(yaw), -Math.sin(yaw)));
    ctx.fillStyle = COLORS.player;
    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.lineTo(-6, 6);
    ctx.lineTo(-3, 0);
    ctx.lineTo(-6, -6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // North arrow and a 50 km scale bar.
    ctx.fillStyle = COLORS.text;
    ctx.textAlign = "right";
    ctx.fillText("N ↑", w - 10, 18);
    const metresPerPixel = ((maxLat - minLat) * 110574) / h;
    const bar = 50000 / metresPerPixel;
    ctx.strokeStyle = COLORS.text;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(12, h - 16);
    ctx.lineTo(12 + bar, h - 16);
    ctx.stroke();
    ctx.textAlign = "left";
    ctx.fillText("50 km", 12, h - 22);
  }

  function show() {
    open = true;
    overlay.hidden = false;
    draw();
    timer = setInterval(draw, 250); // keeps your arrow up to date while the map is open
  }

  function hide() {
    open = false;
    overlay.hidden = true;
    clearInterval(timer);
  }

  button.addEventListener("click", () => {
    button.blur();
    if (open) hide();
    else show();
  });
  overlay.querySelector(".map-close").addEventListener("click", hide);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) hide();
  });
  window.addEventListener("keydown", (event) => {
    if (event.code === "KeyM" && !event.repeat) {
      if (open) hide();
      else show();
    }
    if (event.code === "Escape" && open) hide();
  });
  window.addEventListener("resize", () => {
    if (open) draw();
  });
}