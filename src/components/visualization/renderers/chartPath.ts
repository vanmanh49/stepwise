/** An SVG path through `points`, spread across `width`, with `top` at the top of the box. */
export function sparkPath(points: number[], width: number, height: number, top: number): string {
  const step = points.length > 1 ? width / (points.length - 1) : width;
  const scale = top > 0 ? top : 1;
  return points.map((point, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(height - (point / scale) * (height - 2) - 1).toFixed(1)}`).join(' ');
}
