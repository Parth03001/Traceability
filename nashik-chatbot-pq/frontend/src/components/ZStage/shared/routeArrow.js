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
export function routePath(start, end, obstacles) {
  if (!start || !end) return [];

  const { x: sx, y: sy, dir: sDir } = start;
  const { x: ex, y: ey, dir: eDir } = end;

  const SD = DIR_DELTA[sDir] || [0, 0];
  const ED = DIR_DELTA[eDir] || [0, 0];

  // Forced waypoints one GRID step outside each port, ensuring the first/last
  // segment exits/enters in the declared direction.
  const p1x = sx + SD[0] * GRID;
  const p1y = sy + SD[1] * GRID;
  const p2x = ex + ED[0] * GRID;
  const p2y = ey + ED[1] * GRID;

  // ── Direction-aware grid snapping ────────────────────────────────────────────
  // Top/bottom port x-positions have a 17 px offset from the 40 px grid
  // (formula: bx + 17 + i×40).  Naïve Math.round snaps to the nearest cell,
  // which can be 17 px in the WRONG direction (backward relative to the
  // destination), causing a backward staircase jog at the start/end of the path.
  //
  // Fix: for top/bottom exits, snap g1x TOWARD the destination (ceil when going
  // right, floor when going left).  For the approach (g2x), snap from the
  // direction we're coming FROM.  This ensures the small alignment segment
  // always goes the same direction as the main path and merges away cleanly.
  const goingRight = ex >= sx;

  let g1x, g1y, g2x, g2y;
  if (sDir === 'top' || sDir === 'bottom') {
    // x has 17 px offset — snap toward goal
    g1x = goingRight ? Math.ceil(p1x / GRID) : Math.floor(p1x / GRID);
    g1y = Math.round(p1y / GRID); // y is always grid-aligned for top/bottom ports
  } else {
    g1x = Math.round(p1x / GRID);
    g1y = Math.round(p1y / GRID);
  }
  if (eDir === 'top' || eDir === 'bottom') {
    // Approach from the start side: if going right → last BFS step arrives from
    // the left → g2x should be to the LEFT of p2x (floor)
    g2x = goingRight ? Math.floor(p2x / GRID) : Math.ceil(p2x / GRID);
    g2y = Math.round(p2y / GRID);
  } else {
    g2x = Math.round(p2x / GRID);
    g2y = Math.round(p2y / GRID);
  }

  // Trivial case: both forced waypoints on the same grid cell
  if (g1x === g2x && g1y === g2y) {
    return simplify([[sx, sy], [p1x, p1y], [ex, ey]]);
  }

  const startKey = `${g1x},${g1y}`;
  const goalKey  = `${g2x},${g2y}`;

  // ── Goal-directed step ordering ───────────────────────────────────────────────
  // BFS finds *a* shortest path, but which one depends on the expansion order.
  // By trying directions TOWARD the goal first, BFS naturally finds paths that
  // travel in the right direction without backtracking.  This prevents the small
  // alignment jog at the start from becoming a backward staircase step.
  const dxGoal = g2x - g1x;
  const dyGoal = g2y - g1y;
  const dxPref  = Math.sign(dxGoal) || 1;   // preferred horizontal direction
  const dyPref  = Math.sign(dyGoal) || -1;  // preferred vertical direction
  // Prefer whichever axis has more distance to cover; fall back to horizontal
  const STEPS = Math.abs(dxGoal) >= Math.abs(dyGoal)
    ? [[dxPref, 0], [0, dyPref], [-dxPref, 0], [0, -dyPref]]   // horizontal first
    : [[0, dyPref], [dxPref, 0], [0, -dyPref], [-dxPref, 0]];  // vertical first

  // BFS with parent-pointer tracking for path reconstruction
  const parent = new Map([[startKey, null]]);
  const queue  = [[g1x, g1y]];
  const LIMIT  = 30000; // cap iterations to avoid UI freeze on pathological layouts

  let found = false;
  outer: for (let qi = 0; qi < queue.length && qi < LIMIT; qi++) {
    const [x, y] = queue[qi];
    for (const [dx, dy] of STEPS) {
      const nx  = x + dx;
      const ny  = y + dy;
      const key = `${nx},${ny}`;
      if (parent.has(key)) continue;
      // Keep goal reachable even if it lands inside an obstacle cell
      if (key !== goalKey && obstacles.has(key)) continue;
      // Soft canvas bounds (avoid runaway in degenerate layouts)
      if (nx < -20 || ny < -20 || nx > 300 || ny > 300) continue;

      parent.set(key, [x, y]);
      if (key === goalKey) { found = true; break outer; }
      queue.push([nx, ny]);
    }
  }

  let gridPath;
  if (found) {
    // Reconstruct path by following parent pointers back to start
    gridPath = [];
    let cur = [g2x, g2y];
    while (cur !== null) {
      gridPath.unshift(cur);
      cur = parent.get(`${cur[0]},${cur[1]}`);
    }
  } else {
    // Fallback: simple Z-shape (ignores obstacles, but avoids infinite loop)
    gridPath = [[g1x, g1y], [g1x, g2y], [g2x, g2y]];
  }

  // Convert grid path back to canvas coords
  const mid = gridPath.map(([gx, gy]) => [gx * GRID, gy * GRID]);

  // Full path: exact start → forced exit → BFS grid points → forced approach → exact end
  // We include ALL BFS grid points (including mid[0] ≈ p1 and mid[-1] ≈ p2).
  // Port x-positions have a 17 px offset from the 40 px grid, so mid[0].x may
  // differ from p1x by up to ~20 px.  Including mid[0] turns that gap into a
  // clean short horizontal segment rather than a diagonal.
  const full = [
    [sx, sy],
    [p1x, p1y],
    ...mid,          // all BFS grid points — no slice, keeps routing axis-aligned
    [p2x, p2y],
    [ex, ey],
  ];
  return simplify(full);
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
