import * as THREE from 'three';

export function createGlossMaterial(texture: THREE.Texture): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.15,
    metalness: 0.05,
    envMapIntensity: 0.8,
    side: THREE.FrontSide,
  });
}
