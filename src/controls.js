const LOOK_SPEED = 0.004; // how fast dragging turns the view
const clamp = (value, low, high) => Math.min(Math.max(value, low), high);

// A simple free-look camera:
//   drag = look around, WASD / arrows = walk, Shift = faster.
// The camera always stays at eye height above the ground.
// (If dragging feels backwards to you, change the two "-=" signs below to "+=".)
export function createControls(camera, element, terrain, settings) {
  const keys = new Set();
  let yaw = -(settings.startBearing * Math.PI) / 180;
  let pitch = -0.04;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let waterStatus = { depth: 0, note: "" };

  camera.rotation.order = "YXZ";
  camera.position.set(
    settings.start[0],
    terrain.heightAt(settings.start[0], settings.start[1]) + settings.eyeHeight,
    settings.start[1],
  );

  element.style.touchAction = "none";

  element.addEventListener("pointerdown", (event) => {
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    element.setPointerCapture(event.pointerId);
  });

  element.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    yaw -= (event.clientX - lastX) * LOOK_SPEED;
    pitch = clamp(pitch - (event.clientY - lastY) * LOOK_SPEED, -1.4, 1.4);
    lastX = event.clientX;
    lastY = event.clientY;
  });

  const stopDragging = (event) => {
    dragging = false;
    if (element.hasPointerCapture(event.pointerId)) {
      element.releasePointerCapture(event.pointerId);
    }
  };
  element.addEventListener("pointerup", stopDragging);
  element.addEventListener("pointercancel", stopDragging);

  window.addEventListener("keydown", (event) => keys.add(event.code));
  window.addEventListener("keyup", (event) => keys.delete(event.code));
  window.addEventListener("blur", () => keys.clear());

  function update(delta) {
    let forward = 0;
    let strafe = 0;
    if (keys.has("KeyW") || keys.has("ArrowUp")) forward += 1;
    if (keys.has("KeyS") || keys.has("ArrowDown")) forward -= 1;
    if (keys.has("KeyD") || keys.has("ArrowRight")) strafe += 1;
    if (keys.has("KeyA") || keys.has("ArrowLeft")) strafe -= 1;

    if (forward !== 0 || strafe !== 0) {
      const length = Math.hypot(forward, strafe);
      const fast = keys.has("ShiftLeft") || keys.has("ShiftRight");
      const speed = fast ? settings.runSpeed : settings.walkSpeed;
      const sin = Math.sin(yaw);
      const cos = Math.cos(yaw);
      const f = forward / length;
      const s = strafe / length;

      const moveX = (-sin * f + cos * s) * speed * delta;
      const moveZ = (-cos * f - sin * s) * speed * delta;
      const nextX = camera.position.x + moveX;
      const nextZ = camera.position.z + moveZ;
      const depth = terrain.waterDepthAt ? terrain.waterDepthAt(nextX, nextZ) : 0;
      if (depth > 1.2) {
        waterStatus = { depth, note: "Too deep to cross" };
      } else {
        const wading = depth > 0.4;
        const scale = wading ? 0.6 : 1;
        camera.position.x = nextX;
        camera.position.z = nextZ;
        waterStatus = { depth, note: wading ? `Wading · ${depth.toFixed(1)} m` : "" };
        if (scale < 1) { camera.position.x -= moveX * (1 - scale); camera.position.z -= moveZ * (1 - scale); }
      }

      // Stay inside the walkable circle so you never reach the edge of the ground.
      const distance = Math.hypot(camera.position.x, camera.position.z);
      if (distance > settings.walkRadius) {
        const pull = settings.walkRadius / distance;
        camera.position.x *= pull;
        camera.position.z *= pull;
      }
    }

    // Follow the ground height smoothly.
    const targetY = terrain.heightAt(camera.position.x, camera.position.z) + settings.eyeHeight;
    camera.position.y += (targetY - camera.position.y) * Math.min(1, delta * 12);

    camera.rotation.set(pitch, yaw, 0);
  }

  return { update, getWaterStatus: () => waterStatus };
}