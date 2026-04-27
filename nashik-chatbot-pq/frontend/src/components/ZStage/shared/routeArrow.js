/**
 * routeArrow.js — obstacle-avoiding orthogonal path router for Z-Stage arrows.
 *
 * Algorithm:
 *   1. Resolve auto-direction buyoff ports to the correct boundary tip.
 *   2. Inject orthogonal bridge points to connect off-grid port coords to the
 *      nearest on-grid node without any diagonal segment.
 *   3. Try clean canonical shapes (straight / L-shape) first — O(n) segment
 *      walk.  If the direct path is obstacle-free this always gives the ideal
 *      result with zero turns or exactly one turn.
 *   4. Fall back to A* with a turn penalty only when the canonical shapes are
 *      blocked by box obstacles.
 *   5. Simplify (remove collinear intermediate points).
 */

const GRID       = 40;
const BOX_HEIGHT = 5 * GRID; // 200 px  (header + 3 station rows + description row)
const STEP_COST  = 1;
const TURN_COST  = 10; // penalise direction changes → prefer long straight runs

const DIR_DELTA = {
  top:    [0, -1],
  bottom: [0,  1],
  left:   [-1, 0],
  right:  [1,  0],
};

// ─── Port position helpers ────────────────────────────────────────────────────

export function getPortCanvasPos(portId, boxes, buyoffIcons) {
  if (!portId) return null;

  // No separator → legacy bare buyoff id (dir='auto' is handled in routePath)
  if (!portId.includes('__')) {
    const icon = buyoffIcons.find((b) => b.id === portId);
    if (icon) return { x: icon.position.x + 40, y: icon.position.y + 40, dir: 'auto' };
    return null;
  }

  const dbl    = portId.indexOf('__');
  const elemId = portId.slice(0, dbl);
  const suffix = portId.slice(dbl + 2);

  // ── Box port ────────────────────────────────────────────────────────────────
  const box = boxes.find((b) => b.id === elemId);
  if (box) {
    const cols = box.stationIds?.length ?? 2;
    const w    = Math.max(2, cols) * GRID + 4;
    const h    = BOX_HEIGHT;
    const { x: bx, y: by } = box.position;

    // 3*GRID (120 px) keeps port-y on a GRID multiple → aligns with snapBypass
    if (suffix === 'left')  return { x: bx,     y: by + 3 * GRID, dir: 'left'  };
    if (suffix === 'right') return { x: bx + w, y: by + 3 * GRID, dir: 'right' };

    // Station dot centre: 17 px left-inset + 5 px dot-radius = 22 px
    if (suffix.endsWith('__b')) {
      const sid = suffix.slice(0, -3);
      const idx = box.stationIds?.indexOf(sid) ?? -1;
      if (idx >= 0) return { x: bx + 22 + idx * GRID, y: by + h, dir: 'bottom' };
    }
    const idx = box.stationIds?.indexOf(suffix) ?? -1;
    if (idx >= 0) return { x: bx + 22 + idx * GRID, y: by, dir: 'top' };
  }

  // ── Buyoff port ─────────────────────────────────────────────────────────────
  const icon = buyoffIcons.find((b) => b.id === elemId);
  if (icon) {
    const cx = icon.position.x + 40; // visual centre of the 80×80 icon
    const cy = icon.position.y + 40;
    // Exact boundary midpoints — arrows terminate at the diamond tips
    if (suffix === 'top')    return { x: cx,                   y: icon.position.y,      dir: 'top'    };
    if (suffix === 'bottom') return { x: cx,                   y: icon.position.y + 80, dir: 'bottom' };
    if (suffix === 'left')   return { x: icon.position.x,      y: cy,                   dir: 'left'   };
    if (suffix === 'right')  return { x: icon.position.x + 80, y: cy,                   dir: 'right'  };
  }

  return null;
}

// ─── Obstacle builder ─────────────────────────────────────────────────────────

export function buildObstacles(boxes, marginCells = 0) {
  const occ = new Set();
  for (const box of boxes) {
    const cols = box.stationIds?.length ?? 2;
    const w    = Math.max(2, cols) * GRID + 4;
    const h    = BOX_HEIGHT;
    const x1   = Math.floor(box.position.x / GRID)          - marginCells;
    const y1   = Math.floor(box.position.y / GRID)          - marginCells;
    const x2   = Math.ceil((box.position.x + w) / GRID) - 1 + marginCells;
    const y2   = Math.ceil((box.position.y + h) / GRID) - 1 + marginCells;
    for (let gx = x1; gx <= x2; gx++) {
      for (let gy = y1; gy <= y2; gy++) {
        occ.add(`${gx},${gy}`);
      }
    }
  }
  return occ;
}

// ─── Main router ─────────────────────────────────────────────────────────────

export function routePath(start, end, obstacles) {
  if (!start || !end) return [];

  // Destructure as let so we can adjust auto-direction ports below
  let { x: sx, y: sy, dir: sDir } = start;
  let { x: ex, y: ey, dir: eDir } = end;

  // ── Fix auto-direction (legacy bare buyoff portId) ──────────────────────────
  // Legacy ports return the visual centre of the diamond with dir='auto'.
  // We redirect to the correct boundary tip based on which side the other
  // port sits on, so the arrow touches the diamond point instead of the centre.
  if (sDir === 'auto') {
    const adx = ex - sx, ady = ey - sy;
    if (Math.abs(adx) >= Math.abs(ady)) {
      sDir = adx >= 0 ? 'right' : 'left';
      sx  += adx >= 0 ? 40 : -40;
    } else {
      sDir = ady >= 0 ? 'bottom' : 'top';
      sy  += ady >= 0 ? 40 : -40;
    }
  }
  if (eDir === 'auto') {
    const adx = sx - ex, ady = sy - ey;
    if (Math.abs(adx) >= Math.abs(ady)) {
      eDir = adx >= 0 ? 'right' : 'left';
      ex  += adx >= 0 ? 40 : -40;
    } else {
      eDir = ady >= 0 ? 'bottom' : 'top';
      ey  += ady >= 0 ? 40 : -40;
    }
  }

  const SD = DIR_DELTA[sDir] || [0, 0];
  const ED = DIR_DELTA[eDir] || [0, 0];

  const snap = (v) => Math.round(v / GRID);

  // Forced grid nodes just outside each port
  const g1x = snap(sx) + SD[0];
  const g1y = snap(sy) + SD[1];
  const g2x = snap(ex) + ED[0];
  const g2y = snap(ey) + ED[1];

  const sVert = sDir === 'top' || sDir === 'bottom';
  const eVert = eDir === 'top' || eDir === 'bottom';

  // Bridge points connect the off-grid port coord to the on-grid A* node
  // without any diagonal segment:
  //   vertical exit   [sx, sy] → [sx, g1y*G]  (V) → [g1x*G, g1y*G] (H) → A*…
  //   horizontal exit [sx, sy] → [g1x*G, sy]  (H) → [g1x*G, g1y*G] (V) → A*…
  const bridgeStart = sVert ? [sx,  g1y * GRID] : [g1x * GRID, sy ];
  const bridgeEnd   = eVert ? [ex,  g2y * GRID] : [g2x * GRID, ey ];

  // Degenerate: both forced nodes are the same grid cell
  if (g1x === g2x && g1y === g2y) {
    const dgPath = [[g1x * GRID, g1y * GRID]];
    const { path: dp, tail: dt } = resolveEndBridge(dgPath, bridgeEnd, ex, ey, eVert);
    return simplify([[sx, sy], bridgeStart, ...dp, ...dt]);
  }

  const obsGoalKey = `${g2x},${g2y}`;

  // ── Step 1: try clean canonical shapes (straight line / L-shape) ─────────────
  // These are always the ideal visual result.  We do a fast obstacle-segment
  // walk — O(cells) — and use the result immediately if the path is clear.
  // This eliminates zigzags for all unobstructed connections.
  const canonical = tryCanonical(g1x, g1y, g2x, g2y, obstacles, obsGoalKey);
  if (canonical) {
    const gridPath = canonical.map(([gx, gy]) => [gx * GRID, gy * GRID]);
    const { head, path: spath } = resolveStartBridge(gridPath, bridgeStart, sx, sy, sVert);
    const { path, tail } = resolveEndBridge(spath, bridgeEnd, ex, ey, eVert);
    return simplify([...head, ...path, ...tail]);
  }

  // ── Step 2: A* with turn penalty (fallback for obstructed paths) ─────────────
  const MARGIN = 12;
  const minX = Math.min(g1x, g2x) - MARGIN;
  const maxX = Math.max(g1x, g2x) + MARGIN;
  const minY = Math.min(g1y, g2y) - MARGIN;
  const maxY = Math.max(g1y, g2y) + MARGIN;

  const DIRS      = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const stateKey  = (gx, gy, dx, dy) => `${gx}|${gy}|${dx}|${dy}`;
  const heuristic = (gx, gy) => Math.abs(gx - g2x) + Math.abs(gy - g2y);

  // Minimal binary min-heap — entries: [fCost, gCost, gx, gy, dx, dy]
  const heap = [];
  const heapPush = (item) => {
    heap.push(item);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p][0] <= heap[i][0]) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const heapPop = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length > 0) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = 2 * i + 2;
        let s = i;
        if (l < heap.length && heap[l][0] < heap[s][0]) s = l;
        if (r < heap.length && heap[r][0] < heap[s][0]) s = r;
        if (s === i) break;
        [heap[i], heap[s]] = [heap[s], heap[i]];
        i = s;
      }
    }
    return top;
  };

  const dist   = new Map();
  const parent = new Map();
  const initSk = stateKey(g1x, g1y, SD[0], SD[1]);
  dist.set(initSk, 0);
  parent.set(initSk, null);
  heapPush([heuristic(g1x, g1y), 0, g1x, g1y, SD[0], SD[1]]);

  let foundSk = null;

  while (heap.length > 0) {
    const [, g, cx, cy, cdx, cdy] = heapPop();
    const csk = stateKey(cx, cy, cdx, cdy);
    if (g > (dist.get(csk) ?? Infinity)) continue; // stale
    if (cx === g2x && cy === g2y) { foundSk = csk; break; }

    for (const [dx, dy] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < minX || nx > maxX || ny < minY || ny > maxY) continue;
      const obsKey = `${nx},${ny}`;
      if (obstacles && obstacles.has(obsKey) && obsKey !== obsGoalKey) continue;

      const isTurn = dx !== cdx || dy !== cdy;
      const ng     = g + STEP_COST + (isTurn ? TURN_COST : 0);
      const nsk    = stateKey(nx, ny, dx, dy);
      if (ng < (dist.get(nsk) ?? Infinity)) {
        dist.set(nsk, ng);
        parent.set(nsk, csk);
        heapPush([ng + heuristic(nx, ny), ng, nx, ny, dx, dy]);
      }
    }
  }

  if (foundSk === null) return fallbackPath(sx, sy, SD, ex, ey, ED);

  // Reconstruct grid path from goal back to start
  const gridPath = [];
  let cur = foundSk;
  while (cur !== null) {
    const parts = cur.split('|');
    gridPath.unshift([Number(parts[0]) * GRID, Number(parts[1]) * GRID]);
    cur = parent.get(cur);
  }

  const { head, path: spath } = resolveStartBridge(gridPath, bridgeStart, sx, sy, sVert);
  const { path, tail } = resolveEndBridge(spath, bridgeEnd, ex, ey, eVert);
  return simplify([...head, ...path, ...tail]);
}

// ─── End-bridge resolver ──────────────────────────────────────────────────────

/**
 * Decides how to connect the last gridPath point to [ex, ey] without a
 * T-shaped junction.  Two cases are handled:
 *
 *  1. Last gridPath point already shares the axis coordinate with the endpoint
 *     (x for vertical ports, y for horizontal ports) → bridgeEnd is redundant,
 *     connect directly to [ex, ey].
 *
 *  2. bridgeEnd reverses the direction of the last gridPath segment (A* overshot
 *     the endpoint coordinate along the bridge axis) → drop the overshooting
 *     last point so bridgeEnd becomes the clean corner instead of the T-stem.
 *
 * Returns { path, tail } where the full point sequence is:
 *   [[sx,sy], bridgeStart, ...path, ...tail]
 */
function resolveEndBridge(gridPath, bridgeEnd, ex, ey, eVert) {
  const n = gridPath.length;
  if (n === 0) return { path: gridPath, tail: [bridgeEnd, [ex, ey]] };

  const [lastX, lastY] = gridPath[n - 1];

  // Case 1: already aligned — no off-axis bridge segment needed.
  if (eVert ? lastX === ex : lastY === ey) {
    return { path: gridPath, tail: [[ex, ey]] };
  }

  // Case 2: bridgeEnd is collinear with the last segment but opposite direction.
  if (n >= 2) {
    const [prevX, prevY] = gridPath[n - 2];

    if (eVert && prevY === lastY) {
      // Last segment horizontal, bridgeEnd also horizontal.
      if (Math.sign(lastX - prevX) !== Math.sign(ex - lastX) &&
          lastX !== prevX && ex !== lastX) {
        // Drop the overshooting point; bridgeEnd becomes the corner.
        return { path: gridPath.slice(0, n - 1), tail: [bridgeEnd, [ex, ey]] };
      }
    }

    if (!eVert && prevX === lastX) {
      // Last segment vertical, bridgeEnd also vertical.
      if (Math.sign(lastY - prevY) !== Math.sign(ey - lastY) &&
          lastY !== prevY && ey !== lastY) {
        return { path: gridPath.slice(0, n - 1), tail: [bridgeEnd, [ex, ey]] };
      }
    }
  }

  return { path: gridPath, tail: [bridgeEnd, [ex, ey]] };
}

// ─── Start-bridge resolver ────────────────────────────────────────────────────

/**
 * Symmetric counterpart to resolveEndBridge — eliminates T-junctions at the
 * source side.
 *
 *  1. First gridPath point already shares the source axis coordinate
 *     (x for vertical ports, y for horizontal ports) → bridgeStart is redundant.
 *
 *  2. First gridPath segment reverses bridgeStart's direction → drop the
 *     overshooting g1 point so bridgeStart itself becomes the clean corner.
 *
 * Returns { head, path } where the full point sequence is:
 *   [...head, ...path, bridgeEnd, [ex,ey]]
 */
function resolveStartBridge(gridPath, bridgeStart, sx, sy, sVert) {
  const n = gridPath.length;
  if (n === 0) return { head: [[sx, sy], bridgeStart], path: gridPath };

  const [firstX, firstY] = gridPath[0];

  // Case 1: already aligned — no off-axis bridge segment needed.
  if (sVert ? firstX === sx : firstY === sy) {
    return { head: [[sx, sy]], path: gridPath };
  }

  // Case 2: first gridPath segment reverses bridgeStart's direction → T at bridgeStart.
  if (n >= 2) {
    const [nextX, nextY] = gridPath[1];

    if (sVert && nextY === firstY) {
      // bridgeStart goes horizontal (sx→firstX), first segment also horizontal.
      if (Math.sign(firstX - sx) !== Math.sign(nextX - firstX) &&
          firstX !== sx && nextX !== firstX) {
        // Drop the overshooting g1 point; bridgeStart becomes the corner.
        return { head: [[sx, sy], bridgeStart], path: gridPath.slice(1) };
      }
    }

    if (!sVert && nextX === firstX) {
      // bridgeStart goes vertical (sy→firstY), first segment also vertical.
      if (Math.sign(firstY - sy) !== Math.sign(nextY - firstY) &&
          firstY !== sy && nextY !== firstY) {
        return { head: [[sx, sy], bridgeStart], path: gridPath.slice(1) };
      }
    }
  }

  return { head: [[sx, sy], bridgeStart], path: gridPath };
}

// ─── Canonical shape checker ──────────────────────────────────────────────────

/**
 * Walk each grid segment of a candidate canonical shape and return it if
 * every cell is obstacle-free.  Returns the grid-cell waypoints or null.
 *
 * Shapes tried (in preference order):
 *   1. Straight line  (0 turns)
 *   2. L-shape H→V   (1 turn, corner at g2x,g1y)
 *   3. L-shape V→H   (1 turn, corner at g1x,g2y)
 */
function tryCanonical(g1x, g1y, g2x, g2y, obstacles, obsGoalKey) {
  const segClear = (ax, ay, bx, by) => {
    if (ax === bx) {
      const lo = Math.min(ay, by), hi = Math.max(ay, by);
      for (let y = lo; y <= hi; y++) {
        const k = `${ax},${y}`;
        if (obstacles && obstacles.has(k) && k !== obsGoalKey) return false;
      }
    } else {
      const lo = Math.min(ax, bx), hi = Math.max(ax, bx);
      for (let x = lo; x <= hi; x++) {
        const k = `${x},${ay}`;
        if (obstacles && obstacles.has(k) && k !== obsGoalKey) return false;
      }
    }
    return true;
  };

  // 1. Straight line
  if ((g1x === g2x || g1y === g2y) && segClear(g1x, g1y, g2x, g2y)) {
    return [[g1x, g1y], [g2x, g2y]];
  }

  // Prefer vertical entry if end is vertical port
  if (g2x !== g1x && segClear(g1x, g1y, g1x, g2y) && segClear(g1x, g2y, g2x, g2y)) {
    return [[g1x, g1y], [g1x, g2y], [g2x, g2y]];
  }

  // Otherwise fallback to horizontal-first
  if (segClear(g1x, g1y, g2x, g1y) && segClear(g2x, g1y, g2x, g2y)) {
    return [[g1x, g1y], [g2x, g1y], [g2x, g2y]];
  }

  // 3. L-shape: go vertical first, then horizontal (corner at g1x, g2y)
  if (segClear(g1x, g1y, g1x, g2y) && segClear(g1x, g2y, g2x, g2y)) {
    return [[g1x, g1y], [g1x, g2y], [g2x, g2y]];
  }

  return null;
}

// ─── Fallback (simple L/Z when A* finds no path) ─────────────────────────────

function fallbackPath(sx, sy, SD, ex, ey, ED) {
  const p1x = sx + SD[0] * GRID, p1y = sy + SD[1] * GRID;
  const p2x = ex + ED[0] * GRID, p2y = ey + ED[1] * GRID;
  const sVert = SD[0] === 0, eVert = ED[0] === 0;
  let pts;
  if (sVert && eVert) {
    const midY = (p1y + p2y) / 2;
    pts = [[sx,sy],[p1x,p1y],[p1x,midY],[p2x,midY],[p2x,p2y],[ex,ey]];
  } else if (!sVert && !eVert) {
    const midX = (p1x + p2x) / 2;
    pts = [[sx,sy],[p1x,p1y],[midX,p1y],[midX,p2y],[p2x,p2y],[ex,ey]];
  } else if (sVert) {
    pts = [[sx,sy],[p1x,p1y],[p1x,p2y],[p2x,p2y],[ex,ey]];
  } else {
    pts = [[sx,sy],[p1x,p1y],[p2x,p1y],[p2x,p2y],[ex,ey]];
  }
  return simplify(pts);
}

// ─── Path simplifier ──────────────────────────────────────────────────────────

function simplify(pts) {
  if (pts.length <= 2) return pts;
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i - 1];
    const [cx, cy] = pts[i];
    const [nx, ny] = pts[i + 1];
    const dx1 = Math.sign(cx - px), dy1 = Math.sign(cy - py);
    const dx2 = Math.sign(nx - cx), dy2 = Math.sign(ny - cy);
    if (dx1 !== dx2 || dy1 !== dy2) out.push(pts[i]);
  }
  out.push(pts[pts.length - 1]);
  return out;
}
