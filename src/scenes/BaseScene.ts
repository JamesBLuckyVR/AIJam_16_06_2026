import * as THREE from 'three';
import type { Engine } from '../rendering/Engine.js';
import type { HUD } from '../ui/HUD.js';
import type { PointerManager } from '../input/PointerManager.js';
import type { DeviceOrientation } from '../input/DeviceOrientation.js';
import type { PlayerInventory } from '../entities/PlayerInventory.js';
import type { MarketSystem } from '../systems/MarketSystem.js';
import type { PackOpeningSystem } from '../systems/PackOpeningSystem.js';
import type { SaveSystem } from '../systems/SaveSystem.js';
import type { GameConfig, PackDefinition, StoreDefinition } from '../types/index.js';

export interface SceneContext {
  engine: Engine;
  hud: HUD;
  pointer: PointerManager;
  orientation: DeviceOrientation;
  inventory: PlayerInventory;
  market: MarketSystem;
  packOpener: PackOpeningSystem;
  config: GameConfig;
  packs: PackDefinition[];
  stores: StoreDefinition[];
  goto: (sceneId: string, params?: unknown) => Promise<void>;
  save: () => void;
}

export abstract class BaseScene {
  protected scene: THREE.Scene;
  protected ctx!: SceneContext;

  constructor() {
    this.scene = new THREE.Scene();
  }

  abstract init(ctx: SceneContext, params?: unknown): Promise<void>;
  abstract update(delta: number): void;

  render(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera): void {
    renderer.render(this.scene, camera);
  }

  dispose(): void {
    this.scene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        mesh.geometry?.dispose();
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((m) => m.dispose());
        } else {
          mesh.material?.dispose();
        }
      }
    });
    this.scene.clear();
  }
}
