import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Xwrapper } from 'react-xarrows';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { Pencil, LayoutGrid, Trash2, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import StationBox from './StationBox/StationBox';
import BuyoffIcon from './BypassIcon/BypassIcon';
import AddBoxModal from './AddBoxModal/AddBoxModal';
import { layoutApi } from '../../../services/api/layoutApi';
import { getPortCanvasPos, buildObstacles, routePath } from '../shared/routeArrow';
import './LayoutPreparation.css';

let nextId = 1;
const uid = () => `loc-${nextId++}`;

// ── Grid constants ────────────────────────────────────────────────────────────
const GRID = 40;
const MIN_GAP = GRID;
const CANVAS_SIZE = 5000;

// Box dimensions are multiples of GRID so edges align to grid lines
const boxSize = (stationCount) => ({
  w: Math.max(2, stationCount) * GRID + 4, // 40px per station + 4px border, min 2 cols = 84px
  h: 4 * GRID,                             // 160px = 4 grid rows
});

const snap = (v) => Math.round(v / GRID) * GRID;

// Bypass icon is 62×62px — snap so its visual center lands on a grid intersection
const BYPASS_SIZE = 62;
const BYPASS_HALF = BYPASS_SIZE / 2;
const snapBypass = (v) => Math.round((v + BYPASS_HALF) / GRID) * GRID - BYPASS_HALF;

const overlaps = (a, b) => {
  const sa = boxSize(a.stationCount ?? a.stationIds?.length ?? 2);
  const sb = boxSize(b.stationCount ?? b.stationIds?.length ?? 2);
  return !(
    a.position.x + sa.w + MIN_GAP <= b.position.x ||
    b.position.x + sb.w + MIN_GAP <= a.position.x ||
    a.position.y + sa.h + MIN_GAP <= b.position.y ||
    b.position.y + sb.h + MIN_GAP <= a.position.y
  );
};

const findValidPos = (box, rawPos, others) => {
  const origin = { x: Math.max(0, snap(rawPos.x)), y: Math.max(0, snap(rawPos.y)) };

  for (let radius = 0; radius <= 30; radius++) {
    const candidates = [];
    if (radius === 0) {
      candidates.push(origin);
    } else {
      for (let i = -radius; i <= radius; i++) {
        candidates.push(
          { x: origin.x + i * GRID, y: origin.y - radius * GRID },
          { x: origin.x + i * GRID, y: origin.y + radius * GRID },
        );
        if (i !== -radius && i !== radius) {
          candidates.push(
            { x: origin.x - radius * GRID, y: origin.y + i * GRID },
            { x: origin.x + radius * GRID, y: origin.y + i * GRID },
          );
        }
      }
    }

    for (const pos of candidates) {
      if (pos.x < 0 || pos.y < 0) continue;
      const candidate = { ...box, position: pos };
      if (!others.some((o) => overlaps(candidate, o))) return pos;
    }
  }
  return origin;
};

function stateFromApi(apiLayout) {
  const buildIds = (prefix, count) =>
    Array.from({ length: count }, (_, i) => `${prefix}-${String(i + 1).padStart(2, '0')}`);

  const boxes = (apiLayout.station_boxes || []).map((b) => {
    let parsedStationData = {};
    if (b.station_data) {
      try { parsedStationData = JSON.parse(b.station_data); } catch (_) { parsedStationData = {}; }
    } else if (b.z_labels) {
      // Migrate legacy z_labels into stationData
      try {
        const zMap = JSON.parse(b.z_labels);
        Object.entries(zMap).forEach(([sid, z]) => {
          parsedStationData[sid] = { Z: z, M: '', P: '', D: '', U: '' };
        });
      } catch (_) { parsedStationData = {}; }
    }
    return {
      id: `db-box-${b.id}`,
      dbId: b.id,
      name: b.name,
      stationIds: b.station_ids
        ? (typeof b.station_ids === 'string' ? b.station_ids.split(',') : b.station_ids)
        : buildIds(b.prefix, b.station_count),
      stationData: parsedStationData,
      position: { x: b.position_x, y: b.position_y },
      orderIndex: b.order_index,
    };
  });

  const buyoffIcons = (apiLayout.buyoff_icons || []).map((ic) => ({
    id: `db-buyoff-${ic.id}`,
    dbId: ic.id,
    position: { x: ic.position_x, y: ic.position_y },
  }));

  const connections = (apiLayout.connections || []).map((c) => {
    let fromId, toId;
    if (c.from_box_id != null) {
      const base = `db-box-${c.from_box_id}`;
      fromId = c.from_station_id ? `${base}__${c.from_station_id}` : base;
    } else {
      const base = `db-buyoff-${c.from_buyoff_id}`;
      fromId = c.from_station_id ? `${base}__${c.from_station_id}` : base;
    }
    if (c.to_box_id != null) {
      const base = `db-box-${c.to_box_id}`;
      toId = c.to_station_id ? `${base}__${c.to_station_id}` : base;
    } else {
      const base = `db-buyoff-${c.to_buyoff_id}`;
      toId = c.to_station_id ? `${base}__${c.to_station_id}` : base;
    }
    return { id: `db-conn-${c.id}`, fromId, toId };
  });

  // Normalize: if any element has a negative x/y, shift everything so the
  // minimum coordinate is at (GRID, GRID). This fixes layouts where elements
  // were accidentally dragged into negative canvas space.
  const allX = [...boxes.map((b) => b.position.x), ...buyoffIcons.map((ic) => ic.position.x)];
  const allY = [...boxes.map((b) => b.position.y), ...buyoffIcons.map((ic) => ic.position.y)];
  const shiftX = allX.length ? Math.max(0, GRID - Math.min(...allX)) : 0;
  const shiftY = allY.length ? Math.max(0, GRID - Math.min(...allY)) : 0;
  const shiftedBoxes = shiftX || shiftY
    ? boxes.map((b) => ({ ...b, position: { x: b.position.x + shiftX, y: b.position.y + shiftY } }))
    : boxes;
  const shiftedBuyoff = shiftX || shiftY
    ? buyoffIcons.map((ic) => ({ ...ic, position: { x: ic.position.x + shiftX, y: ic.position.y + shiftY } }))
    : buyoffIcons;

  return { boxes: shiftedBoxes, buyoffIcons: shiftedBuyoff, connections };
}

function LayoutPreparation({
  showAddBoxModal,
  onCloseAddBoxModal,
  addBuyoffSignal,
  onSaveLayout,
  onLoadLayout,
  userId,
}) {
  const [boxes, setBoxes] = useState([]);
  const [buyoffIcons, setBuyoffIcons] = useState([]);
  const [connections, setConnections] = useState([]);
  const [layoutName, setLayoutName] = useState('New Layout');
  const [editingName, setEditingName] = useState(false);
  const [currentLayoutId, setCurrentLayoutId] = useState(null);
  const [canvasScale, setCanvasScale] = useState(1);
  const [transformState, setTransformState] = useState({ scale: 1, positionX: 0, positionY: 0 });

  // ── Drag-to-connect state ────────────────────────────────────────────────────
  const [dragging, setDragging] = useState(null);
  const [dragPos, setDragPos] = useState({ x2: 0, y2: 0 });
  const canvasRef = useRef(null);
  const transformRef = useRef(null);

  // Fit the view so all loaded elements are visible with padding
  const fitView = useCallback((loadedBoxes, loadedBuyoffIcons) => {
    if (!transformRef.current) return;
    if (loadedBoxes.length === 0 && loadedBuyoffIcons.length === 0) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    loadedBoxes.forEach((box) => {
      const w = boxSize(box.stationIds?.length ?? 2).w;
      const h = 4 * GRID; // boxSize height is always 160px
      minX = Math.min(minX, box.position.x);
      minY = Math.min(minY, box.position.y);
      maxX = Math.max(maxX, box.position.x + w);
      maxY = Math.max(maxY, box.position.y + h);
    });

    loadedBuyoffIcons.forEach((icon) => {
      minX = Math.min(minX, icon.position.x);
      minY = Math.min(minY, icon.position.y);
      maxX = Math.max(maxX, icon.position.x + BYPASS_SIZE);
      maxY = Math.max(maxY, icon.position.y + BYPASS_SIZE);
    });

    const canvasEl = canvasRef.current;
    if (!canvasEl) return;
    const rect = canvasEl.getBoundingClientRect();

    const PAD = 80;
    const contentW = maxX - minX + PAD * 2;
    const contentH = maxY - minY + PAD * 2;

    const scaleByW = rect.width  / contentW;
    const scaleByH = rect.height / contentH;
    const scale = Math.min(scaleByW, scaleByH, 1) * 0.76;

    // Center both axes
    const posX = (rect.width  - contentW * scale) / 2 - (minX - PAD) * scale;
    const posY = (rect.height - contentH * scale) / 2 - (minY - PAD) * scale;

    transformRef.current.setTransform(posX, posY, scale, 300);
  }, []);

  // Attach window-level mousemove / mouseup only while a connection is being dragged
  useEffect(() => {
    if (!dragging) return;

    const onMove = (e) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      setDragPos({ x2: e.clientX - rect.left, y2: e.clientY - rect.top });
    };

    const onUp = (e) => {
      // Determine the source box ID (strip station suffix if present)
      const isFromStation = dragging.fromId.includes('__');
      const fromBoxId = isFromStation ? dragging.fromId.split('__')[0] : dragging.fromId;

      let targetId = null;

      // 1. Check station-level port dots (primary targets for box connections)
      const sidPorts = document.querySelectorAll('.station-sid-port');
      for (const el of sidPorts) {
        if (el.id === dragging.fromId) continue;           // same port
        if (el.id.startsWith(fromBoxId + '__')) continue;  // same box, different station
        const r = el.getBoundingClientRect();
        const PAD = 10; // generous hit area for small dots
        if (e.clientX >= r.left - PAD && e.clientX <= r.right + PAD &&
            e.clientY >= r.top  - PAD && e.clientY <= r.bottom + PAD) {
          targetId = el.id;
          break;
        }
      }

      // 2. Box-level port dots (left/right) — use the dot's own id directly
      if (!targetId) {
        const boxPorts = document.querySelectorAll('.station-box-port');
        for (const el of boxPorts) {
          const box = el.closest('.station-box');
          if (!box || box.id === fromBoxId) continue;
          if (el.id === dragging.fromId) continue;
          const r = el.getBoundingClientRect();
          const PAD = 10;
          if (e.clientX >= r.left - PAD && e.clientX <= r.right + PAD &&
              e.clientY >= r.top  - PAD && e.clientY <= r.bottom + PAD) {
            targetId = el.id;  // e.g. "db-box-2__left"
            break;
          }
        }
      }

      // 3. Buyoff port buttons (with direction IDs — preferred over wrapper)
      if (!targetId) {
        const buyoffPorts = document.querySelectorAll('.buyoff-port');
        for (const el of buyoffPorts) {
          if (!el.id || el.id === dragging.fromId) continue;
          const r = el.getBoundingClientRect();
          const PAD = 10;
          if (e.clientX >= r.left - PAD && e.clientX <= r.right + PAD &&
              e.clientY >= r.top  - PAD && e.clientY <= r.bottom + PAD) {
            targetId = el.id;  // e.g. "db-buyoff-5__top"
            break;
          }
        }
      }

      // 4. Fall back to buyoff wrapper (for drops anywhere inside the diamond)
      if (!targetId) {
        const buyoffs = document.querySelectorAll('.buyoff-icon-wrapper');
        for (const el of buyoffs) {
          if (el.id === dragging.fromId || el.id === fromBoxId) continue;
          const r = el.getBoundingClientRect();
          if (e.clientX >= r.left && e.clientX <= r.right &&
              e.clientY >= r.top  && e.clientY <= r.bottom) {
            targetId = el.id;
            break;
          }
        }
      }

      if (targetId) {
        setConnections((prev) => {
          const dup = prev.some(
            (c) => c.fromId === dragging.fromId && c.toId === targetId,
          );
          if (dup) return prev;
          return [...prev, { id: uid(), fromId: dragging.fromId, toId: targetId }];
        });
      }
      setDragging(null);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging?.fromId]);

  // Called by StationBox / BuyoffIcon when user mousedowns on a connection port
  const handlePortMouseDown = useCallback((fromId, clientX, clientY) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    setDragging({ fromId, x1: x, y1: y });
    setDragPos({ x2: x, y2: y });
  }, []);

  // Add buyoff icon when parent signals it
  useEffect(() => {
    if (addBuyoffSignal > 0) handleAddBuyoff();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addBuyoffSignal]);

  // ── Box actions ─────────────────────────────────────────────────────────────
  const handleAddBox = useCallback((boxData) => {
    const id = uid();
    setBoxes((prev) => {
      const baseStationData = boxData.stationData || {};
      const newBox = {
        id,
        dbId: null,
        name: boxData.name,
        stationIds: boxData.stationIds,
        stationData: boxData.description
          ? { ...baseStationData, __box_desc__: boxData.description }
          : baseStationData,
        orderIndex: prev.length,
        position: { x: 0, y: 0 },
      };
      const position = findValidPos(
        { ...newBox, stationCount: boxData.stationIds.length },
        { x: GRID, y: GRID },
        prev,
      );
      return [...prev, { ...newBox, position }];
    });
  }, []);

  const handleBoxPositionChange = useCallback((id, rawPos) => {
    const snapped = { x: snap(rawPos.x), y: snap(rawPos.y) };
    setBoxes((prev) => {
      const updated = prev.map((b) => (b.id === id ? { ...b, position: snapped } : b));
      // Move dragged box to end so it renders on top (highest DOM order = highest stacking)
      const idx = updated.findIndex((b) => b.id === id);
      if (idx < updated.length - 1) {
        return [...updated.filter((b) => b.id !== id), updated[idx]];
      }
      return updated;
    });
  }, []);

  const handleDeleteBox = useCallback((id) => {
    setBoxes((prev) => prev.filter((b) => b.id !== id));
    setConnections((prev) => prev.filter((c) => c.fromId !== id && c.toId !== id));
  }, []);

  // ── Buyoff icon actions ─────────────────────────────────────────────────────
  const handleAddBuyoff = useCallback(() => {
    const id = uid();
    setBuyoffIcons((prev) => [
      ...prev,
      { id, dbId: null, position: { x: snapBypass(GRID + prev.length * GRID * 2), y: snapBypass(GRID) } },
    ]);
  }, []);

  const handleBuyoffPositionChange = useCallback((id, rawPos) => {
    const snapped = { x: snapBypass(rawPos.x), y: snapBypass(rawPos.y) };
    setBuyoffIcons((prev) => prev.map((b) => (b.id === id ? { ...b, position: snapped } : b)));
  }, []);

  const handleDeleteBuyoff = useCallback((id) => {
    setBuyoffIcons((prev) => prev.filter((b) => b.id !== id));
    setConnections((prev) => prev.filter((c) => c.fromId !== id && c.toId !== id));
  }, []);

  // ── Delete connection ────────────────────────────────────────────────────────
  const handleDeleteConnection = useCallback((connId) => {
    setConnections((prev) => prev.filter((c) => c.id !== connId));
  }, []);

  // ── Save layout ─────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    const payload = {
      name: layoutName,
      boxes: boxes.map((b) => ({
        local_id: b.id,
        name: b.name,
        prefix: b.stationIds?.[0]?.split('-')[0] ?? 'ST',
        station_count: b.stationIds?.length ?? 0,
        station_ids: b.stationIds?.join(','),
        station_data: JSON.stringify(b.stationData ?? {}),
        position_x: b.position.x,
        position_y: b.position.y,
        order_index: b.orderIndex,
      })),
      buyoff_icons: buyoffIcons.map((ic) => ({
        local_id: ic.id,
        position_x: ic.position.x,
        position_y: ic.position.y,
      })),
      connections: connections.map((c) => ({
        from_local_id: c.fromId,
        to_local_id: c.toId,
      })),
    };

    try {
      let response;
      if (currentLayoutId) {
        response = await layoutApi.updateSnapshot(currentLayoutId, payload);
      } else {
        response = await layoutApi.createSnapshot(payload, userId);
      }
      const saved = response.data;
      setCurrentLayoutId(saved.id);
      const rebuilt = stateFromApi(saved);
      setBoxes(rebuilt.boxes);
      setBuyoffIcons(rebuilt.buyoffIcons);
      setConnections(rebuilt.connections);
      setLayoutName(saved.name);
      return true;
    } catch (err) {
      console.error('Save failed:', err);
      return false;
    }
  }, [layoutName, boxes, buyoffIcons, connections, currentLayoutId, userId]);

  // ── Load layout ─────────────────────────────────────────────────────────────
  const handleLoad = useCallback(async (layoutId) => {
    try {
      const response = await layoutApi.getLayout(layoutId);
      const data = response.data;
      const rebuilt = stateFromApi(data);
      setBoxes(rebuilt.boxes);
      setBuyoffIcons(rebuilt.buyoffIcons);
      setConnections(rebuilt.connections);
      setLayoutName(data.name);
      setCurrentLayoutId(data.id);
      // Auto-fit: wait one tick for React to render new positions, then zoom to fit
      setTimeout(() => fitView(rebuilt.boxes, rebuilt.buyoffIcons), 80);
    } catch (err) {
      console.error('Load failed:', err);
    }
  }, [fitView]);

  // ── Clear all ───────────────────────────────────────────────────────────────
  const handleClearAll = () => {
    if (window.confirm('Clear the canvas? (Saved layouts are not deleted.)')) {
      setBoxes([]);
      setBuyoffIcons([]);
      setConnections([]);
      setCurrentLayoutId(null);
      setLayoutName('New Layout');
    }
  };

  // Expose handleSave and handleLoad to parent
  useEffect(() => {
    if (onSaveLayout) onSaveLayout(handleSave);
  }, [handleSave, onSaveLayout]);

  useEffect(() => {
    if (onLoadLayout) onLoadLayout(handleLoad);
  }, [handleLoad, onLoadLayout]);

  return (
    // Xwrapper wraps the whole component so Xarrow SVGs render in screen space
    // (outside TransformComponent) — this is required for correct arrow positioning
    // at any zoom/pan level, since Xarrow uses getBoundingClientRect() for coordinates.
    <Xwrapper>
      <div className="layout-prep">
        {/* Toolbar */}
        <div className="layout-toolbar">
          <div className="layout-toolbar-left">
            {editingName ? (
              <input
                className="layout-name-input"
                value={layoutName}
                onChange={(e) => setLayoutName(e.target.value)}
                onBlur={() => setEditingName(false)}
                onKeyDown={(e) => e.key === 'Enter' && setEditingName(false)}
                autoFocus
              />
            ) : (
              <h2 className="layout-name" onClick={() => setEditingName(true)} title="Click to edit">
                {layoutName}
                {currentLayoutId && <span className="layout-saved-badge">Saved</span>}
                <span className="layout-name-edit-icon"><Pencil size={13} /></span>
              </h2>
            )}
          </div>

          <div className="layout-toolbar-right">
            <span className="layout-connect-hint">Drag from a port dot to connect</span>
            <button className="toolbar-btn toolbar-btn--clear" onClick={handleClearAll}>
              <Trash2 size={14} />
              Clear All
            </button>
          </div>
        </div>

        {/* Stats bar */}
        <div className="layout-stats">
          <span className="layout-stat"><strong>{boxes.length}</strong> Boxes</span>
          <span className="layout-stat"><strong>{buyoffIcons.length}</strong> Buyoff Icons</span>
          <span className="layout-stat"><strong>{connections.length}</strong> Connections</span>
          <span className="layout-stat layout-stat--hint">Scroll to zoom · Drag canvas to pan</span>
        </div>

        {/* Canvas — backgroundSize/Position synced with zoom+pan so grid scales with content */}
        <div
          className="layout-canvas"
          ref={canvasRef}
          style={{
            backgroundSize: `${GRID * transformState.scale}px ${GRID * transformState.scale}px`,
            backgroundPosition: `${transformState.positionX}px ${transformState.positionY}px`,
          }}
        >
          <TransformWrapper
            ref={transformRef}
            limitToBounds={false}
            minScale={0.15}
            maxScale={3}
            wheel={{ step: 0.08 }}
            panning={{ excluded: ['station-box-header', 'buyoff-drag-handle', 'station-port', 'buyoff-port'] }}
            onTransformed={(_, state) => {
                setCanvasScale(state.scale);
                setTransformState({ scale: state.scale, positionX: state.positionX, positionY: state.positionY });
              }}
          >
            {({ zoomIn, zoomOut, resetTransform }) => (
              <>
                <TransformComponent
                  wrapperStyle={{ width: '100%', height: '100%' }}
                  contentStyle={{ width: `${CANVAS_SIZE}px`, height: `${CANVAS_SIZE}px` }}
                >
                  <div
                    className="layout-virtual-canvas"
                    style={{ width: CANVAS_SIZE, height: CANVAS_SIZE }}
                  >
                    {boxes.length === 0 && buyoffIcons.length === 0 && (
                      <div className="layout-canvas-empty">
                        <div className="layout-canvas-empty-icon">
                          <LayoutGrid size={52} strokeWidth={1} />
                        </div>
                        <p>No station boxes yet.</p>
                        <p>Use <strong>Add Box</strong> in the left panel to start.</p>
                      </div>
                    )}

                    {buyoffIcons.map((icon) => (
                      <BuyoffIcon
                        key={icon.id}
                        id={icon.id}
                        position={icon.position}
                        onPositionChange={handleBuyoffPositionChange}
                        onDelete={handleDeleteBuyoff}
                        onPortMouseDown={handlePortMouseDown}
                        canvasScale={canvasScale}
                      />
                    ))}

                    {boxes.map((box) => (
                      <StationBox
                        key={box.id}
                        id={box.id}
                        name={box.name}
                        stationIds={box.stationIds}
                        stationData={box.stationData}
                        description={box.stationData?.__box_desc__ || ''}
                        position={box.position}
                        onPositionChange={handleBoxPositionChange}
                        onDelete={handleDeleteBox}
                        onPortMouseDown={handlePortMouseDown}
                        canvasScale={canvasScale}
                      />
                    ))}
                  </div>
                </TransformComponent>

                {/* Zoom controls */}
                <div className="canvas-zoom-controls">
                  <button className="canvas-zoom-btn" onClick={() => zoomIn()} title="Zoom in">
                    <ZoomIn size={14} />
                  </button>
                  <button className="canvas-zoom-btn" onClick={() => zoomOut()} title="Zoom out">
                    <ZoomOut size={14} />
                  </button>
                  <button className="canvas-zoom-btn" onClick={() => resetTransform()} title="Reset view">
                    <Maximize2 size={14} />
                  </button>
                </div>
              </>
            )}
          </TransformWrapper>

          {/* Drag-to-connect temporary line (screen-space overlay, outside transform) */}
          {dragging && (
            <svg className="layout-drag-svg">
              <defs>
                <marker id="drag-arrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                  <polygon points="0 0, 8 3, 0 6" fill="#3182ce" />
                </marker>
              </defs>
              <line
                x1={dragging.x1}
                y1={dragging.y1}
                x2={dragPos.x2}
                y2={dragPos.y2}
                stroke="#3182ce"
                strokeWidth={2}
                strokeDasharray="6 3"
                markerEnd="url(#drag-arrow)"
              />
            </svg>
          )}
        </div>

        {showAddBoxModal && (
          <AddBoxModal onAdd={handleAddBox} onClose={onCloseAddBoxModal} />
        )}
      </div>

      {/* ── Connections: BFS-routed SVG arrows that avoid box obstacles ─────────
          Routes are computed in canvas space and converted to screen space via
          transformState.  The fixed-position SVG overlay sits above everything. */}
      {(() => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect || connections.length === 0) return null;
        const { left: cl, top: ct } = rect;
        const { scale, positionX, positionY } = transformState;

        // Convert a canvas-space point to screen-space SVG coordinates
        const toScreen = (cx, cy) => [
          cl + positionX + cx * scale,
          ct + positionY + cy * scale,
        ];

        const obstacles = buildObstacles(boxes, 0);

        const arrows = connections.map((conn) => {
          const sp  = getPortCanvasPos(conn.fromId, boxes, buyoffIcons);
          const ep  = getPortCanvasPos(conn.toId,   boxes, buyoffIcons);
          const pts = routePath(sp, ep, obstacles);
          if (!pts || pts.length < 2) return null;

          const screenPts = pts.map(([cx, cy]) => toScreen(cx, cy));
          const d = 'M ' + screenPts.map(([x, y]) => `${x},${y}`).join(' L ');

          return (
            <g
              key={conn.id}
              style={{ pointerEvents: 'all', cursor: 'pointer' }}
              onClick={() => handleDeleteConnection(conn.id)}
            >
              {/* Wide transparent hit-area so the line is easy to click */}
              <path d={d} stroke="transparent" strokeWidth={12} fill="none" />
              {/* Visible arrow */}
              <path d={d} stroke="#1a2744" strokeWidth={2} fill="none"
                    markerEnd="url(#lp-arrow-head)" />
            </g>
          );
        });

        return (
          <svg
            style={{
              position: 'fixed', top: 0, left: 0,
              width: '100vw', height: '100vh',
              pointerEvents: 'none',
              zIndex: 100, overflow: 'visible',
            }}
          >
            <defs>
              <marker id="lp-arrow-head" markerWidth="8" markerHeight="6"
                      refX="7" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill="#1a2744" />
              </marker>
            </defs>
            {arrows}
          </svg>
        );
      })()}
    </Xwrapper>
  );
}

export default LayoutPreparation;
