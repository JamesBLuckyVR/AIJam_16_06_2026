import type { Vec2 } from '../utils/math.js';
import { vec2Length } from '../utils/math.js';

interface CutResult {
  isCut: boolean;
  angle: number;
}

interface PackScreenBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

function segmentsIntersect(p1: Vec2, p2: Vec2, p3: Vec2, p4: Vec2): boolean {
  const d1x = p2.x - p1.x, d1y = p2.y - p1.y;
  const d2x = p4.x - p3.x, d2y = p4.y - p3.y;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-10) return false;
  const t = ((p3.x - p1.x) * d2y - (p3.y - p1.y) * d2x) / denom;
  const u = ((p3.x - p1.x) * d1y - (p3.y - p1.y) * d1x) / denom;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

export class GestureDetector {
  static detectCut(start: Vec2, end: Vec2, bounds: PackScreenBounds): CutResult {
    const { left, right, top, bottom } = bounds;

    const leftEdge = { p1: { x: left, y: top }, p2: { x: left, y: bottom } };
    const rightEdge = { p1: { x: right, y: top }, p2: { x: right, y: bottom } };
    const topEdge = { p1: { x: left, y: top }, p2: { x: right, y: top } };
    const bottomEdge = { p1: { x: left, y: bottom }, p2: { x: right, y: bottom } };

    const crossesLeft = segmentsIntersect(start, end, leftEdge.p1, leftEdge.p2);
    const crossesRight = segmentsIntersect(start, end, rightEdge.p1, rightEdge.p2);
    const crossesTop = segmentsIntersect(start, end, topEdge.p1, topEdge.p2);
    const crossesBottom = segmentsIntersect(start, end, bottomEdge.p1, bottomEdge.p2);

    const isCut = (crossesLeft && crossesRight) || (crossesTop && crossesBottom);
    const angle = Math.atan2(end.y - start.y, end.x - start.x);

    return { isCut, angle };
  }

  static swipeVelocity(positions: Vec2[], timestamps: number[]): number {
    const n = positions.length;
    if (n < 2) return 0;
    const recent = Math.max(0, n - 5);
    const dx = positions[n - 1].x - positions[recent].x;
    const dt = timestamps[n - 1] - timestamps[recent];
    if (dt <= 0) return 0;
    return dx / dt;
  }

  static dragMagnitude(start: Vec2, end: Vec2): number {
    return vec2Length({ x: end.x - start.x, y: end.y - start.y });
  }
}
