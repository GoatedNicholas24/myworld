// Lightweight optional scale poles. Geometry/materials are shared across every marker.
export function createScaleMarkers(THREE, scene, terrain) {
  const group = new THREE.Group();
  scene.add(group);
  const poleGeometry = new THREE.CylinderGeometry(0.025, 0.035, 1.8, 5);
  const poleMaterial = new THREE.MeshLambertMaterial({ color: "#e6dfc9" });
  const flagGeometry = new THREE.BufferGeometry();
  flagGeometry.setAttribute("position", new THREE.Float32BufferAttribute([
    0, 0.78, 0, 0.34, 0.65, 0, 0, 0.5, 0,
  ], 3));
  flagGeometry.computeVertexNormals();
  const flagMaterial = new THREE.MeshLambertMaterial({ color: "#c54b35", side: THREE.DoubleSide });
  const markers = [];

  function place(camera) {
    const x = camera.position.x;
    const z = camera.position.z;
    const marker = new THREE.Group();
    const pole = new THREE.Mesh(poleGeometry, poleMaterial);
    pole.position.y = 0.9;
    const flag = new THREE.Mesh(flagGeometry, flagMaterial);
    flag.position.set(0, 0.9, 0);
    marker.add(pole, flag);
    marker.position.set(x, terrain.heightAt(x, z), z);
    group.add(marker);
    markers.push(marker);
  }

  function clear() {
    for (const marker of markers) group.remove(marker);
    markers.length = 0;
  }

  return {
    group,
    place,
    clear,
    dispose() {
      clear();
      scene.remove(group);
      poleGeometry.dispose();
      poleMaterial.dispose();
      flagGeometry.dispose();
      flagMaterial.dispose();
    },
    count: () => markers.length,
  };
}
