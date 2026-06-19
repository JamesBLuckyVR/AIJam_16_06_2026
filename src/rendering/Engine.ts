import * as THREE from 'three';

export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera: THREE.PerspectiveCamera;
  readonly clock: THREE.Clock;

  private _onUpdate?: (delta: number) => void;
  private _onRender?: (renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera) => void;
  private _running = false;
  private _rafId = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = false;
    this.renderer.localClippingEnabled = true;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
    this.camera.position.set(0, 0, 6);

    this.clock = new THREE.Clock();

    window.addEventListener('resize', this._onResize);
  }

  setCallbacks(
    onUpdate: (delta: number) => void,
    onRender: (renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera) => void,
  ): void {
    this._onUpdate = onUpdate;
    this._onRender = onRender;
  }

  start(): void {
    if (this._running) return;
    this._running = true;
    this.clock.start();
    this._loop();
  }

  stop(): void {
    this._running = false;
    cancelAnimationFrame(this._rafId);
  }

  private _loop = (): void => {
    if (!this._running) return;
    this._rafId = requestAnimationFrame(this._loop);
    const delta = this.clock.getDelta();
    this._onUpdate?.(delta);
    this._onRender?.(this.renderer, this.camera);
  };

  private _onResize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  dispose(): void {
    this.stop();
    window.removeEventListener('resize', this._onResize);
    this.renderer.dispose();
  }
}
