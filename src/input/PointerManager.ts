import type { Vec2 } from '../utils/math.js';

export interface DragEvent {
  start: Vec2;
  current: Vec2;
  delta: Vec2;
  positions: Vec2[];
  timestamps: number[];
}

type PointerHandler = (e: DragEvent) => void;
type TapHandler = (pos: Vec2) => void;

const TAP_MAX_MOVE = 12;
const TAP_MAX_MS = 220;

export class PointerManager {
  private _isDragging = false;
  private _startPos: Vec2 = { x: 0, y: 0 };
  private _lastPos: Vec2 = { x: 0, y: 0 };
  private _startTime = 0;
  private _positions: Vec2[] = [];
  private _timestamps: number[] = [];
  private readonly _canvas: HTMLCanvasElement;

  private _onDragStart?: PointerHandler;
  private _onDrag?: PointerHandler;
  private _onDragEnd?: PointerHandler;
  private _onTap?: TapHandler;

  constructor(canvas: HTMLCanvasElement) {
    this._canvas = canvas;
    canvas.addEventListener('pointerdown', this._onDown);
    canvas.addEventListener('pointermove', this._onMove);
    canvas.addEventListener('pointerup', this._onUp);
    canvas.addEventListener('pointercancel', this._onUp);
  }

  on(event: 'dragstart' | 'drag' | 'dragend', handler: PointerHandler): void;
  on(event: 'tap', handler: TapHandler): void;
  on(event: string, handler: PointerHandler | TapHandler): void {
    if (event === 'dragstart') this._onDragStart = handler as PointerHandler;
    else if (event === 'drag') this._onDrag = handler as PointerHandler;
    else if (event === 'dragend') this._onDragEnd = handler as PointerHandler;
    else if (event === 'tap') this._onTap = handler as TapHandler;
  }

  private _buildEvent(current: Vec2): DragEvent {
    return {
      start: { ...this._startPos },
      current,
      delta: { x: current.x - this._lastPos.x, y: current.y - this._lastPos.y },
      positions: [...this._positions],
      timestamps: [...this._timestamps],
    };
  }

  private _onDown = (e: PointerEvent): void => {
    if (e.target !== this._canvas) return;
    e.preventDefault();
    this._canvas.setPointerCapture(e.pointerId);
    const pos = { x: e.clientX, y: e.clientY };
    this._startPos = pos;
    this._lastPos = pos;
    this._startTime = performance.now();
    this._isDragging = true;
    this._positions = [pos];
    this._timestamps = [this._startTime];
    this._onDragStart?.(this._buildEvent(pos));
  };

  private _onMove = (e: PointerEvent): void => {
    if (!this._isDragging) return;
    const pos = { x: e.clientX, y: e.clientY };
    const evt = this._buildEvent(pos);
    this._positions.push(pos);
    this._timestamps.push(performance.now());
    if (this._positions.length > 20) {
      this._positions.shift();
      this._timestamps.shift();
    }
    this._lastPos = pos;
    this._onDrag?.(evt);
  };

  private _onUp = (e: PointerEvent): void => {
    if (!this._isDragging) return;
    this._isDragging = false;
    const pos = { x: e.clientX, y: e.clientY };
    const evt = this._buildEvent(pos);
    this._onDragEnd?.(evt);

    const dx = pos.x - this._startPos.x;
    const dy = pos.y - this._startPos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const elapsed = performance.now() - this._startTime;
    if (dist < TAP_MAX_MOVE && elapsed < TAP_MAX_MS) {
      this._onTap?.(pos);
    }
  };

  clientToNDC(pos: Vec2): Vec2 {
    return {
      x: (pos.x / window.innerWidth) * 2 - 1,
      y: -((pos.y / window.innerHeight) * 2 - 1),
    };
  }

  dispose(): void {
    this._canvas.removeEventListener('pointerdown', this._onDown);
    this._canvas.removeEventListener('pointermove', this._onMove);
    this._canvas.removeEventListener('pointerup', this._onUp);
    this._canvas.removeEventListener('pointercancel', this._onUp);
  }
}
