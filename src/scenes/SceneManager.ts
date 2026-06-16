import type * as THREE from 'three';
import type { BaseScene, SceneContext } from './BaseScene.js';

type SceneFactory = () => BaseScene;

export class SceneManager {
  private registry = new Map<string, SceneFactory>();
  private current: BaseScene | null = null;
  private transitioning = false;
  private ctx!: Omit<SceneContext, 'goto' | 'save'>;
  private saveCallback!: () => void;

  register(id: string, factory: SceneFactory): void {
    this.registry.set(id, factory);
  }

  init(ctx: Omit<SceneContext, 'goto' | 'save'>, save: () => void): void {
    this.ctx = ctx;
    this.saveCallback = save;
  }

  private buildCtx(): SceneContext {
    return {
      ...this.ctx,
      goto: (id, params) => this.goto(id, params),
      save: this.saveCallback,
    };
  }

  async goto(sceneId: string, params?: unknown): Promise<void> {
    if (this.transitioning) return;
    this.transitioning = true;

    const factory = this.registry.get(sceneId);
    if (!factory) throw new Error(`SceneManager: unknown scene "${sceneId}"`);

    await this.ctx.hud.fadeOut();

    if (this.current) {
      this.ctx.hud.clearScene();
      this.ctx.pointer.on('dragstart', () => {});
      this.ctx.pointer.on('drag', () => {});
      this.ctx.pointer.on('dragend', () => {});
      this.ctx.pointer.on('tap', () => {});
      this.current.dispose();
      this.current = null;
    }

    const next = factory();
    await next.init(this.buildCtx(), params);
    this.current = next;

    await this.ctx.hud.fadeIn();
    this.transitioning = false;
  }

  update(delta: number): void {
    this.current?.update(delta);
  }

  render(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera): void {
    this.current?.render(renderer, camera);
  }
}
