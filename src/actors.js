import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { toToon } from "./toon.js";

// Models that walk or drive along a path. Each is listed in local.json.
// If a model has not been downloaded, it is skipped and the game still runs.

// Where is something that has travelled `distance` metres along its path, and which way does it face?
function pointOnPath(path, distance) {
  if (path.type === "loop") {
    const angle = distance / path.radius;
    return {
      x: path.center[0] + Math.cos(angle) * path.radius,
      z: path.center[1] + Math.sin(angle) * path.radius,
      heading: Math.atan2(-Math.sin(angle), Math.cos(angle)),
    };
  }

  // A straight line: go there, turn round, come back.
  const [ax, az] = path.from;
  const [bx, bz] = path.to;
  const length = Math.hypot(bx - ax, bz - az);
  const t = distance % (2 * length);
  const forward = t <= length;
  const u = (forward ? t : 2 * length - t) / length;
  const sign = forward ? 1 : -1;
  return {
    x: ax + (bx - ax) * u,
    z: az + (bz - az) * u,
    heading: Math.atan2((bx - ax) * sign, (bz - az) * sign),
  };
}

export function createActors(list, terrain) {
  const group = new THREE.Group();
  const loader = new GLTFLoader();
  const actors = [];

  for (const config of list ?? []) {
    loader
      .loadAsync(`${import.meta.env.BASE_URL}models/${config.file}`)
      .then((gltf) => {
        const model = gltf.scene;
        toToon(model);
        model.scale.setScalar(config.scale ?? 1);

        // Models that are not animated skeletons can be measured and stood on the ground.
        if (config.fitSize) {
          model.updateMatrixWorld(true);
          const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
          model.scale.multiplyScalar(config.fitSize / Math.max(size.x, size.y, size.z));
          model.updateMatrixWorld(true);
          const box = new THREE.Box3().setFromObject(model);
          const center = box.getCenter(new THREE.Vector3());
          model.position.set(-center.x, -box.min.y, -center.z);
        }

        const holder = new THREE.Group();
        holder.add(model);
        group.add(holder);

        let mixer = null;
        const clip = THREE.AnimationClip.findByName(gltf.animations, config.clip) ?? gltf.animations[0];
        if (clip) {
          mixer = new THREE.AnimationMixer(model);
          mixer.clipAction(clip).play();
        }

        actors.push({ config, holder, mixer, distance: 0, waited: 0 });
      })
      .catch(() => console.warn(`Model ${config.file} was not found in public/models/ (skipped).`));
  }

  return {
    group,
    update(delta) {
      for (const actor of actors) {
        const { config } = actor;
        let step = delta;

        // "Animating on twos": the model only moves a few times per second, like a drawing.
        if (config.stepFps > 0) {
          actor.waited += delta;
          if (actor.waited < 1 / config.stepFps) continue;
          step = actor.waited;
          actor.waited = 0;
        }

        actor.distance += config.speed * step;
        actor.mixer?.update(step);

        const point = pointOnPath(config.path, actor.distance);
        actor.holder.position.set(point.x, terrain.heightAt(point.x, point.z), point.z);
        actor.holder.rotation.y = point.heading + (config.facing ?? 0);
      }
    },
  };
}