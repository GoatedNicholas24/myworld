const LOOK_SPEED = 0.004;
const clamp = (value, low, high) => Math.min(Math.max(value, low), high);

// Optional navigation features are enabled by the Great Lakes tile world only.
export function createControls(camera, element, terrain, settings, options = {}) {
  const keys = new Set();
  let yaw = -(settings.startBearing * Math.PI) / 180;
  let pitch = -0.04;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let flying = false;

  camera.rotation.order = "YXZ";
  camera.position.set(settings.start[0], terrain.heightAt(settings.start[0], settings.start[1]) + settings.eyeHeight, settings.start[1]);
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
    if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
  };
  element.addEventListener("pointerup", stopDragging);
  element.addEventListener("pointercancel", stopDragging);

  function faceTarget(targetX, targetZ, targetY) {
    const dx = targetX - camera.position.x;
    const dz = targetZ - camera.position.z;
    yaw = Math.atan2(-dx, -dz);
    pitch = clamp(-Math.atan2(targetY - camera.position.y, Math.max(1, Math.hypot(dx, dz))), -1.2, 1.2);
  }

  function visitLandmark(index) {
    const landmark = options.landmarks?.[index];
    if (!landmark) return;
    flying = false;
    camera.position.x = clamp(landmark.x, -9900, 9900);
    camera.position.z = clamp(landmark.z + 150, -9900, 9900);
    camera.position.y = terrain.heightAt(camera.position.x, camera.position.z) + settings.eyeHeight;
    faceTarget(landmark.x, landmark.z, terrain.heightAt(landmark.x, landmark.z));
    options.onFlightChange?.(flying);
  }

  window.addEventListener("keydown", (event) => {
    keys.add(event.code);
    if (event.repeat) return;
    if (options.landmarks && /^Digit[1-9]$/.test(event.code)) visitLandmark(Number(event.code.slice(-1)) - 1);
    if (options.allowFlight && event.code === "KeyF") {
      flying = !flying;
      options.onFlightChange?.(flying);
    }
    if (options.onPlaceMarker && event.code === "KeyP") options.onPlaceMarker();
    if (options.onRemoveMarkers && event.code === "KeyO") options.onRemoveMarkers();
  });
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
      const speed = flying ? (fast ? 600 : 150) : (fast ? settings.runSpeed : settings.walkSpeed);
      const sin = Math.sin(yaw);
      const cos = Math.cos(yaw);
      const f = forward / length;
      const s = strafe / length;
      camera.position.x += (-sin * f + cos * s) * speed * delta;
      camera.position.z += (-cos * f - sin * s) * speed * delta;
    }
    if (flying) {
      if (keys.has("Space")) camera.position.y += 150 * delta;
      if (keys.has("ControlLeft") || keys.has("ControlRight")) camera.position.y -= 150 * delta;
    } else {
      const distance = Math.hypot(camera.position.x, camera.position.z);
      if (distance > settings.walkRadius) {
        const pull = settings.walkRadius / distance;
        camera.position.x *= pull;
        camera.position.z *= pull;
      }
      const targetY = terrain.heightAt(camera.position.x, camera.position.z) + settings.eyeHeight;
      camera.position.y += (targetY - camera.position.y) * Math.min(1, delta * 12);
    }
    camera.rotation.set(pitch, yaw, 0);
  }
  return { update, isFlying: () => flying, visitLandmark, faceTarget };
}
