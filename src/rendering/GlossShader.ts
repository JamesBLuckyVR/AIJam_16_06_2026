import * as THREE from 'three';

export function createGlossMaterial(texture: THREE.Texture): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    map: texture,
    side: THREE.FrontSide,
  });
}
