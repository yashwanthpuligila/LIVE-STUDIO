import { AnnotationElement, AnnotationPoint, AnnotationTool } from '../../shared/types';

export interface LaserPoint {
  x: number;
  y: number;
  time: number;
}

export const LASER_LIFETIME_MS = 500;

/** Tools that place marks on the canvas (everything except pointer, eraser and laser). */
export const DRAWING_TOOLS: AnnotationTool[] = ['pen', 'highlighter', 'arrow', 'line', 'rect', 'circle', 'text'];

export function createElementId(prefix = 'ann'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
}

/** Eraser hit radius in canvas pixels for a given brush size. */
export function eraserRadius(strokeWidth: number): number {
  return Math.max(10, strokeWidth * 2);
}

function textWidth(el: AnnotationElement): number {
  // Close enough for hit-testing without a canvas context
  return (el.text?.length ?? 0) * (el.fontSize || 32) * 0.58;
}

/** Draws one annotation element. Used by the studio layer, the live preview and the screen overlay. */
export function drawElement(ctx: CanvasRenderingContext2D, el: AnnotationElement) {
  const pts = el.points;
  if (pts.length === 0) return;

  ctx.save();
  ctx.globalAlpha = el.opacity;
  ctx.strokeStyle = el.color;
  ctx.fillStyle = el.color;
  ctx.lineWidth = el.strokeWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (el.tool === 'highlighter') {
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = el.strokeWidth * 2.5;
  }

  if (el.tool === 'pen' || el.tool === 'highlighter') {
    if (pts.length > 1) {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      // Midpoint quadratic smoothing removes the jagged look of raw pointer samples
      for (let i = 1; i < pts.length - 1; i++) {
        const mx = (pts[i].x + pts[i + 1].x) / 2;
        const my = (pts[i].y + pts[i + 1].y) / 2;
        ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
      }
      const last = pts[pts.length - 1];
      ctx.lineTo(last.x, last.y);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(pts[0].x, pts[0].y, ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if ((el.tool === 'line' || el.tool === 'arrow') && pts.length >= 2) {
    const [p1, p2] = pts;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();

    if (el.tool === 'arrow') {
      const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
      const headLen = Math.max(16, el.strokeWidth * 3.5);
      ctx.beginPath();
      ctx.moveTo(p2.x, p2.y);
      ctx.lineTo(p2.x - headLen * Math.cos(angle - Math.PI / 6), p2.y - headLen * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(p2.x - headLen * Math.cos(angle + Math.PI / 6), p2.y - headLen * Math.sin(angle + Math.PI / 6));
      ctx.closePath();
      ctx.fill();
    }
  } else if (el.tool === 'rect' && pts.length >= 2) {
    const [p1, p2] = pts;
    ctx.strokeRect(Math.min(p1.x, p2.x), Math.min(p1.y, p2.y), Math.abs(p2.x - p1.x), Math.abs(p2.y - p1.y));
  } else if (el.tool === 'circle' && pts.length >= 2) {
    const [p1, p2] = pts;
    const rx = Math.abs(p2.x - p1.x) / 2;
    const ry = Math.abs(p2.y - p1.y) / 2;
    ctx.beginPath();
    ctx.ellipse(Math.min(p1.x, p2.x) + rx, Math.min(p1.y, p2.y) + ry, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (el.tool === 'text' && el.text) {
    ctx.font = `bold ${el.fontSize || 32}px Inter, sans-serif`;
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 6;
    ctx.fillText(el.text, pts[0].x, pts[0].y);
  }
  ctx.restore();
}

export function drawElements(ctx: CanvasRenderingContext2D, elements: AnnotationElement[]) {
  for (const el of elements) drawElement(ctx, el);
}

/** Fading laser pointer trail. */
export function drawLaser(ctx: CanvasRenderingContext2D, points: LaserPoint[], radius = 24) {
  const now = Date.now();
  for (const pt of points) {
    const alpha = Math.max(0, 1 - (now - pt.time) / LASER_LIFETIME_MS);

    const grad = ctx.createRadialGradient(pt.x, pt.y, 2, pt.x, pt.y, radius);
    grad.addColorStop(0, `rgba(239, 68, 68, ${alpha})`);
    grad.addColorStop(0.5, `rgba(239, 68, 68, ${alpha * 0.4})`);
    grad.addColorStop(1, 'rgba(239, 68, 68, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function distToSegment(p: AnnotationPoint, a: AnnotationPoint, b: AnnotationPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function distToPolyline(p: AnnotationPoint, pts: AnnotationPoint[]): number {
  if (pts.length === 1) return Math.hypot(p.x - pts[0].x, p.y - pts[0].y);
  let min = Infinity;
  for (let i = 1; i < pts.length; i++) min = Math.min(min, distToSegment(p, pts[i - 1], pts[i]));
  return min;
}

/** True when an eraser circle of `radius` centred on `p` touches the element. */
export function hitTestElement(el: AnnotationElement, p: AnnotationPoint, radius: number): boolean {
  const pts = el.points;
  if (pts.length === 0) return false;
  const halfStroke = (el.tool === 'highlighter' ? el.strokeWidth * 2.5 : el.strokeWidth) / 2;
  const reach = radius + halfStroke;

  switch (el.tool) {
    case 'pen':
    case 'highlighter':
      return distToPolyline(p, pts) <= reach;
    case 'line':
    case 'arrow':
      return pts.length >= 2 && distToSegment(p, pts[0], pts[1]) <= reach;
    case 'rect': {
      if (pts.length < 2) return false;
      const [a, b] = pts;
      const corners = [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }, a];
      return distToPolyline(p, corners) <= reach;
    }
    case 'circle': {
      if (pts.length < 2) return false;
      const [a, b] = pts;
      const rx = Math.abs(b.x - a.x) / 2;
      const ry = Math.abs(b.y - a.y) / 2;
      const cx = Math.min(a.x, b.x) + rx;
      const cy = Math.min(a.y, b.y) + ry;
      const ring: AnnotationPoint[] = [];
      for (let i = 0; i <= 48; i++) {
        const t = (i / 48) * Math.PI * 2;
        ring.push({ x: cx + rx * Math.cos(t), y: cy + ry * Math.sin(t) });
      }
      return distToPolyline(p, ring) <= reach;
    }
    case 'text': {
      const size = el.fontSize || 32;
      const x = pts[0].x;
      const y = pts[0].y;
      return p.x >= x - radius && p.x <= x + textWidth(el) + radius && p.y >= y - size - radius && p.y <= y + radius;
    }
    default:
      return false;
  }
}
