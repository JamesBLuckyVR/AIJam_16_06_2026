import { clamp } from '../utils/math.js';

export class DeviceOrientation {
  private _tiltX = 0;
  private _tiltY = 0;
  private _active = false;

  get tiltX(): number { return this._tiltX; }
  get tiltY(): number { return this._tiltY; }
  get isActive(): boolean { return this._active; }

  async requestAndStart(): Promise<boolean> {
    type DevOrientEvent = typeof DeviceOrientationEvent & {
      requestPermission?: () => Promise<'granted' | 'denied'>;
    };
    const DOE = DeviceOrientationEvent as DevOrientEvent;

    if (typeof DOE.requestPermission === 'function') {
      try {
        const result = await DOE.requestPermission();
        if (result !== 'granted') return false;
      } catch {
        return false;
      }
    }

    this.start();
    return true;
  }

  start(): void {
    if (this._active) return;
    this._active = true;
    window.addEventListener('deviceorientation', this._onOrientation);
  }

  stop(): void {
    this._active = false;
    window.removeEventListener('deviceorientation', this._onOrientation);
  }

  private _onOrientation = (e: DeviceOrientationEvent): void => {
    this._tiltX = clamp((e.gamma ?? 0) / 45, -1, 1);
    this._tiltY = clamp((e.beta ?? 0) / 45, -1, 1);
  };
}
