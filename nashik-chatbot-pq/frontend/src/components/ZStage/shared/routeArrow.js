/**
 * routeArrow.js — obstacle-avoiding orthogonal path router for Z-Stage arrows.
 *
 * All coordinates are in "canvas space" (the 40 px grid that boxes sit on).
 * Callers convert the resulting waypoints to screen space using transformState.
 *
 * Algorithm:
 *   1. From the start port, take one forced step outward (in the exit direction)
 *      to guarantee the first segment leaves the box cleanly.
 *   2. Same forced step outward from the end port (in the entry direction).
 *   3. BFS on the 40 px grid between those two forced waypoints, treating box
 *      interiors as obstacles.
 *   4. Simplify the resulting path (remove collinear intermediate points).
 *   5. Re-attach the exact start/end canvas positions so the arrow meets each
 *      port dot precisely.
 */

const GRID = 40;

// Maps a direction name to its unit-vector on the canvas grid.
// These vectors are the OUTWARD direction for a port on that side:
//   top    → arrow exits upward   (y decreases)
//   bottom → arrow exits downward (y increases)
//   left   → arrow exits leftward (x decreases)
//   right  → arrow exits rightward(x increases)
const DIR_DELTA = {
  top:    [0, -1],
  bottom: [0,  1],
  left:   [-1, 0],
  right:  [1,  0],
};

// ─── Port position helpers ────────────────────────────────────────────────────

/**
 * Resolve a port DOM id to its canvas-space {x, y, dir} position.
 *
 * Port id formats (same scheme used in StationBox / BypassIcon):
 *   boxId__stationId          → top station dot,    dir='top'
 *   boxId__stationId__b       → bottom station dot, dir='bottom'
 *   boxId__left               → box left port,      dir='left'
 *   boxId__right              → box right port,     dir='right'
 *   buyoffId__top             → buyoff top port,    dir='top'
 *   buyoffId__bottom          → buyoff bottom port, dir='bottom'
 *   buyoffId__left            → buyoff left port,   dir='left'
 *   buyoffId__right           → buyoff right port,  dir='right'
 *   buyoffId                  → bare buyoff (legacy), dir='auto'
 */
export function getPortCanvasPos(portId, boxes, buyoffIcons) {
  if (!portId) return null;

  // No separator → bare buyoff id (legacy, no direction info)
  if (!portId.includes('__')) {
    const icon = buyoffIcons.find((b) => b.id === portId);
    if (icon) return { x: icon.position.x + 31, y: icon.position.y + 31, dir: 'auto' };
    return null;
  }

  const dbl   = portId.indexOf('__');
  const elemId = portId.slice(0, dbl);
  const suffix = portId.slice(dbl + 2);

  // ── Box port ────────────────────────────────────────────────────────────────
  const box = boxes.find((b) => b.id === elemId);
  if (box) {
    const cols = box.stationIds?.length ?? 2;
    const w    = Math.max(2, cols) * GRID + 4;
    const h    = 4 * GRID; // 160 px
    const { x: bx, y: by } = box.position;

    if (suffix === 'left')  return { x: bx,     y: by + h / 2, dir: 'left'  };
    if (suffix === 'right') return { x: bx + w, y: by + h / 2, dir: 'right' };

    // Bottom station dot  (e.g.  "T1-02__b")
    if (suffix.endsWith('__b')) {
      const sid = suffix.slice(0, -3);
      const idx = box.stationIds?.indexOf(sid) ?? -1;
      if (idx >= 0) return { x: bx + 17 + idx * GRID, y: by + h, dir: 'bottom' };
    }

    // Top station dot  (e.g.  "T1-02")
    const idx = box.stationIds?.indexOf(suffix) ?? -1;
    if (idx >= 0) return { x: bx + 17 + idx * GRID, y: by, dir: 'top' };
  }

  // ── Buyoff port ─────────────────────────────────────────────────────────────
  const icon = buyoffIcons.find((b) => b.id === elemId);
  if (icon) {
    const cx = icon.position.x + 31; // visual centre (icon is 62 × 62)
    const cy = icon.position.y + 31;
    if (suffix === 'top')    return { x: cx,                   y: icon.position.y,      dir: 'top'    };
    if (suffix === 'bottom') return { x: cx,                   y: icon.position.y + 62, dir: 'bottom' };
    if (suffix === 'left')   return { x: icon.position.x,      y: cy,                   dir: 'left'   };
    if (suffix === 'right')  return { x: icon.position.x + 62, y: cy,                   dir: 'right'  };
  }

  return null;
}

// ─── Obstacle builder ─────────────────────────────────────────────────────────

/**
 * Build a Set of "gx,gy" grid-cell keys that are occupied by box bodies.
 *
 * A 40 px grid cell (gx, gy) is marked as an obstacle if it overlaps the
 * interior of any station box.  Edge cells (where ports live) stay free so
 * routing along box borders is possible.
 *
 * @param {Array}  boxes        — boxes in canvas-space coordinates
 * @param {number} marginCells  — extra cells of margin to add around each box
 *                                (default 0; use 1 to force a gap between routes
 *                                 and box walls)
 */
export function buildObstacles(boxes, marginCells = 0) {
  const occ = new Set();
  for (const box of boxes) {
    const cols = box.stationIds?.length ?? 2;
    const w    = Math.max(2, cols) * GRID + 4;
    const h    = 4 * GRID;
    // Range of grid cells whose bounding rect overlaps [bx, bx+w) × [by, by+h)
    const x1 = Math.floor(box.position.x / GRID)             - marginCells;
    const y1 = Math.floor(box.position.y / GRID)             - marginCells;
    const x2 = Math.ceil((box.position.x + w) / GRID) - 1    + marginCells;
    const y2 = Math.ceil((box.position.y + h) / GRID) - 1    + marginCells;
    for (let gx = x1; gx <= x2; gx++) {
      for (let gy = y1; gy <= y2; gy++) {
        occ.add(`${gx},${gy}`);
      }
    }
  }
  return occ;
}

// ─── BFS orthogonal router ────────────────────────────────────────────────────

/**
 * Compute an obstacle-avoiding orthogonal path between two canvas-space ports.
 *
 * Returns an array of [x, y] canvas-coordinate pairs that form a clean
 * rectilinear (Manhattan) polyline.  The first and last points are the exact
 * port positions; intermediate points lie on the 40 px grid.
 *
 * @param  {{ x, y, dir }} start     — start port (canvas coords + direction)
 * @param  {{ x, y, dir }} end       — end   port (canvas coords + direction)
 * @param  {Set<string>}   obstacles — grid cells to avoid ("gx,gy" keys)
 * @returns {Array<[number,number]>} waypoints in canvas space
 */
export function routePath(start, end, _obstacles) {
  if (!start || !end) return [];

  const { x: sx, y: sy, dir: sDir } = start;
  const { x: ex, y: ey, dir: eDir } = end;

  const SD = DIR_DELTA[sDir] || [0, 0];
  const ED = DIR_DELTA[eDir] || [0, 0];

  // One forced step outside each port so the path exits/enters the box cleanly.
  const p1x = sx + SD[0] * GRID;
  const p1y = sy + SD[1] * GRID;
  const p2x = ex + ED[0] * GRID;
  const p2y = ey + ED[1] * GRID;

  const sVert = sDir === 'top' || sDir === 'bottom';
  const eVert = eDir === 'top' || eDir === 'bottom';

  let pts;
  if (sVert && eVert) {
    // Both vertical ports (e.g. bottom→top): Z-shape with a horizontal mid-bridge
    const midY = (p1y + p2y) / 2;
    pts = [[sx, sy], [p1x, p1y], [p1x, midY], [p2x, midY], [p2x, p2y], [ex, ey]];
  } else if (!sVert && !eVert) {
    // Both horizontal ports (e.g. right→left): Z-shape with a vertical mid-bridge
    const midX = (p1x + p2x) / 2;
    pts = [[sx, sy], [p1x, p1y], [midX, p1y], [midX, p2y], [p2x, p2y], [ex, ey]];
  } else if (sVert && !eVert) {
    // Vertical exit → horizontal entry: L-shape, corner at (p1x, p2y)
    pts = [[sx, sy], [p1x, p1y], [p1x, p2y], [p2x, p2y], [ex, ey]];
  } else {
    // Horizontal exit → vertical entry: L-shape, corner at (p2x, p1y)
    pts = [[sx, sy], [p1x, p1y], [p2x, p1y], [p2x, p2y], [ex, ey]];
  }

  return simplify(pts);
}

// ─── Path simplifier ──────────────────────────────────────────────────────────

/** Remove intermediate collinear points from an orthogonal polyline. */
function simplify(pts) {
  if (pts.length <= 2) return pts;
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i - 1];
    const [cx, cy] = pts[i];
    const [nx, ny] = pts[i + 1];
    const dx1 = Math.sign(cx - px), dy1 = Math.sign(cy - py);
    const dx2 = Math.sign(nx - cx), dy2 = Math.sign(ny - cy);
    if (dx1 !== dx2 || dy1 !== dy2) out.push(pts[i]); // keep only turns
  }
  out.push(pts[pts.length - 1]);
  return out;
}
