import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Xwrapper } from 'react-xarrows';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { Pencil, LayoutGrid, Trash2, ZoomIn, ZoomOut, Maximize2, Check, Cloud, AlertCircle, X } from 'lucide-react';
import StationBox from './StationBox/StationBox';
import BuyoffIcon from './BypassIcon/BypassIcon';
import CanvasTextLabel from './CanvasTextLabel/CanvasTextLabel';
import CanvasArrow from './CanvasArrow/CanvasArrow';
import AddBoxModal from './AddBoxModal/AddBoxModal';
import { layoutApi } from '../../../services/api/layoutApi';
import { getPortCanvasPos, buildObstacles, routePath } from '../shared/routeArrow';
import HelpGuide from '../shared/HelpGuide/HelpGuide';
import './LayoutPreparation.css';

const LAYOUT_HELP = {
  title: 'Layout Preparation — Guide',
  sections: [
    {
      heading: 'Getting Started',
      items: [
        { icon: '➕', label: 'Add Box',         desc: 'Click "Add Box" in the sidebar to create a new station group. Enter a name, choose station IDs (Auto, Range, or Custom), and optionally add station names.' },
        { icon: '💎', label: 'Add Buyoff',      desc: 'Click "Add Buyoff" in the sidebar to drop a diamond-shaped buyoff / bypass icon onto the canvas. Drag it to reposition; expand the diamond to connect ports or remove it.' },
        { icon: '🔤', label: 'Add Text',        desc: 'Click "Add Text" in the sidebar to place a free text box anywhere on the canvas. Drag to move, resize from the corner/edge handles, and double-click to edit the text. An empty text box is auto-removed on click-away.' },
        { icon: '➡️', label: 'Add Arrow',       desc: 'Click "Add Arrow" in the sidebar to place a broad directional arrow on the canvas. Drag to move, resize from the handles, click to reveal a toolbar where you can rotate the arrow 90° or add a label.' },
        { icon: '💾', label: 'Save Layout',     desc: 'Click "Save Layout" in the sidebar to manually save the current state. Changes are also auto-saved after 1.5 s — the cloud indicator in the toolbar shows Saved / Saving / Pending.' },
      ],
    },
    {
      heading: 'Canvas Navigation',
      items: [
        { icon: '🖱️', label: 'Pan',            desc: 'Click and drag on an empty area of the canvas to pan around.' },
        { icon: '🔍', label: 'Zoom',            desc: 'Use the scroll wheel, or the +/− toolbar buttons (top-right), to zoom in and out.' },
        { icon: '⊡',  label: 'Fit View',       desc: 'Click the "Fit" button in the toolbar to zoom and centre all boxes in view.' },
      ],
    },
    {
      heading: 'Working with Boxes',
      items: [
        { icon: '✋', label: 'Move',             desc: 'Drag a box by its header bar to reposition it. Boxes snap to the grid.' },
        { icon: '✏️', label: 'Edit Title',       desc: 'Double-click the box title to rename it inline.' },
        { icon: '🏷️', label: 'Edit Station ID',  desc: 'Double-click a green station ID header cell to rename that station.' },
        { icon: '📝', label: 'Station Name',     desc: 'Double-click the blue row below a station ID to add or edit the station\'s display name.' },
        { icon: '📄', label: 'Description',      desc: 'Click the grey description bar (below the blue row) to add a short description for the whole box.' },
        { icon: '🗑️', label: 'Delete Box',       desc: 'Click the × in the top-right corner of a box, or select the box and press Delete / Backspace.' },
      ],
    },
    {
      heading: 'Connections (Arrows)',
      items: [
        { icon: '🔴', label: 'Draw Arrow',       desc: 'Hover over a box to reveal the red port dots on each edge. Drag from one dot to another box\'s dot to create a connection arrow.' },
        { icon: '🖱️', label: 'Delete Arrow',     desc: 'Click an existing arrow to select it, then click the red × that appears on it to delete.' },
      ],
    },
    {
      heading: 'Selection & Clipboard',
      items: [
        { icon: '🖱️', label: 'Select',           desc: 'Click a box to select it (blue outline). Hold Ctrl and click to multi-select.' },
        { icon: '📋', label: 'Copy / Paste',     desc: 'Ctrl+C to copy selected boxes, Ctrl+V to paste with a small offset. Sidebar also has Copy and Paste buttons.' },
        { icon: '↩️', label: 'Undo / Redo',      desc: 'Ctrl+Z to undo, Ctrl+Y (or Ctrl+Shift+Z) to redo — up to 50 steps.' },
        { icon: '⌫',  label: 'Delete Selected',  desc: 'Press Delete or Backspace to remove all selected boxes at once.' },
        { icon: '⎋',  label: 'Deselect',         desc: 'Press Escape to clear the current selection.' },
      ],
    },
    {
      heading: 'Managing Layouts',
      items: [
        { icon: '📂', label: 'Open Layout',      desc: 'Click "Open Layout" in the sidebar to expand a dropdown listing all saved layouts. Click any layout name to load it onto the canvas.' },
        { icon: '📑', label: 'Copy a Layout',    desc: 'In the Open Layout dropdown, click the ⋯ (three-dot) menu on any layout and choose "Copy" to create a full duplicate.' },
        { icon: '✏️', label: 'Rename a Layout',  desc: 'In the Open Layout dropdown, click ⋯ → "Rename" to edit the layout\'s name inline.' },
        { icon: '🗑️', label: 'Delete a Layout',  desc: 'In the Open Layout dropdown, click ⋯ → "Delete" to permanently remove that layout (a confirmation prompt appears).' },
      ],
    },
  ],
};

// Returns the first name not already present in savedLayouts: 'New Layout', then 'New Layout 1', '2', …
function uniqueLayoutName(base, savedLayouts) {
  const names = new Set((savedLayouts || []).map((l) => l.name));
  if (!names.has(base)) return base;
  let n = 1;
  while (names.has(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}

let nextId = 1;
const uid = () => `loc-${nextId++}`;

// ── Grid constants ────────────────────────────────────────────────────────────
const GRID = 40;
const MIN_GAP = GRID;
const CANVAS_SIZE = 5000;

// Box dimensions are multiples of GRID so edges align to grid lines
const boxSize = (stationCount) => ({
  w: Math.max(2, stationCount) * GRID + 4, // 40px per station + 4px border, min 2 cols = 84px
  h: 5 * GRID,                             // 200px = 5 grid rows (includes station names row)
});

const snap = (v) => Math.round(v / GRID) * GRID;

// Find the nearest grid-aligned spot to (baseCx, baseCy) that doesn't overlap any box
const findClearSpot = (baseCx, baseCy, w, h, boxes) => {
  const PAD = GRID;
  for (let r = 0; r <= 20; r++) {
    const candidates = r === 0
      ? [{ x: baseCx, y: baseCy }]
      : [
          { x: baseCx,             y: baseCy - r * GRID },
          { x: baseCx,             y: baseCy + r * GRID },
          { x: baseCx - r * GRID,  y: baseCy            },
          { x: baseCx + r * GRID,  y: baseCy            },
          { x: baseCx - r * GRID,  y: baseCy - r * GRID },
          { x: baseCx + r * GRID,  y: baseCy - r * GRID },
          { x: baseCx - r * GRID,  y: baseCy + r * GRID },
          { x: baseCx + r * GRID,  y: baseCy + r * GRID },
        ];
    for (const { x, y } of candidates) {
      if (x < GRID || y < GRID) continue;
      const clear = boxes.every((b) => {
        const bw = Math.max(2, b.stationIds?.length ?? 2) * GRID + 4;
        const bh = 5 * GRID;
        return (x + w + PAD <= b.position.x || b.position.x + bw + PAD <= x ||
                y + h + PAD <= b.position.y || b.position.y + bh + PAD <= y);
      });
      if (clear) return { x, y };
    }
  }
  return { x: Math.max(GRID, baseCx), y: Math.max(GRID, baseCy) };
};

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

    // Lift station names out of stationData into a first-class field so they
    // survive every save→rebuild cycle independently of the stationData blob.
    const stationNames = Array.isArray(parsedStationData.__station_names__)
      ? parsedStationData.__station_names__
      : [];
    const cleanStationData = { ...parsedStationData };
    delete cleanStationData.__station_names__;

    return {
      id: `db-box-${b.id}`,
      dbId: b.id,
      name: b.name,
      stationIds: b.station_ids
        ? (typeof b.station_ids === 'string' ? b.station_ids.split(',') : b.station_ids)
        : buildIds(b.prefix, b.station_count),
      stationNames,
      stationData: cleanStationData,
      position: { x: b.position_x, y: b.position_y },
      orderIndex: b.order_index,
    };
  });

  const buyoffIcons = (apiLayout.buyoff_icons || []).map((ic) => ({
    id: `db-buyoff-${ic.id}`,
    dbId: ic.id,
    position: { x: ic.position_x, y: ic.position_y },
    name: ic.name || '',
  }));

  let textLabels = [];
  try {
    const raw = apiLayout.text_labels;
    textLabels = raw ? JSON.parse(raw) : [];
  } catch { textLabels = []; }

  let canvasArrows = [];
  try {
    const raw = apiLayout.canvas_arrows;
    canvasArrows = raw ? JSON.parse(raw) : [];
  } catch { canvasArrows = []; }

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

  const shiftedTextLabels = shiftX || shiftY
    ? textLabels.map((tl) => ({ ...tl, x: tl.x + shiftX, y: tl.y + shiftY }))
    : textLabels;

  const shiftedArrows = shiftX || shiftY
    ? canvasArrows.map((a) => ({ ...a, x: a.x + shiftX, y: a.y + shiftY }))
    : canvasArrows;

  return { boxes: shiftedBoxes, buyoffIcons: shiftedBuyoff, connections, textLabels: shiftedTextLabels, canvasArrows: shiftedArrows };
}

function LayoutPreparation({
  showAddBoxModal,
  onCloseAddBoxModal,
  addBuyoffSignal,
  addTextSignal,
  addArrowSignal,
  onSaveLayout,
  onLoadLayout,
  onCopyLayout,
  onSaved,
  savedLayouts = [],
  userId,
}) {
  const [boxes, setBoxes] = useState([]);
  const [buyoffIcons, setBuyoffIcons] = useState([]);
  const [textLabels, setTextLabels] = useState([]);
  const [canvasArrows, setCanvasArrows] = useState([]);
  const [connections, setConnections] = useState([]);
  const [layoutName, setLayoutName] = useState('New Layout');
  const [editingName, setEditingName] = useState(false);
  const [currentLayoutId, setCurrentLayoutId] = useState(null);
  const [canvasScale, setCanvasScale] = useState(1);
  const [transformState, setTransformState] = useState({ scale: 1, positionX: 0, positionY: 0 });

  // ── Selection + clipboard ────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState([]); // string[]
  const [clipboard, setClipboard]     = useState(null); // box[] | null

  // ── Auto-save state ──────────────────────────────────────────────────────────
  // 'idle' | 'pending' | 'saving' | 'saved' | 'error'
  const [autoSaveStatus, setAutoSaveStatus] = useState('idle');
  const [showNameModal, setShowNameModal] = useState(false);
  const [nameDraft, setNameDraft]           = useState('');
  const autoSaveTimerRef   = useRef(null);
  const isSavingRef        = useRef(false);
  const isLoadingRef       = useRef(false);
  const nameModalShownRef  = useRef(false); // show name modal only once per new layout
  const isDirtyRef         = useRef(false);
  const savedLayoutsRef    = useRef(savedLayouts);
  useEffect(() => { savedLayoutsRef.current = savedLayouts; }, [savedLayouts]);
  const handleSaveRef      = useRef(null);  // always points to latest handleSave

  // ── Undo / Redo history ───────────────────────────────────────────────────────
  const undoStackRef  = useRef([]);  // snapshots we can go back to
  const redoStackRef  = useRef([]);  // snapshots we can go forward to
  // Mirror refs so history callbacks always read current state without stale closure
  const boxesRef      = useRef([]);
  const buyoffRef     = useRef([]);
  const connsRef      = useRef([]);
  const textLabelsRef    = useRef([]);
  const canvasArrowsRef  = useRef([]);
  const transformStateRef = useRef({ scale: 1, positionX: 0, positionY: 0 });
  useEffect(() => { boxesRef.current         = boxes;        }, [boxes]);
  useEffect(() => { buyoffRef.current        = buyoffIcons;  }, [buyoffIcons]);
  useEffect(() => { connsRef.current         = connections;  }, [connections]);
  useEffect(() => { textLabelsRef.current    = textLabels;   }, [textLabels]);
  useEffect(() => { canvasArrowsRef.current  = canvasArrows; }, [canvasArrows]);
  useEffect(() => { transformStateRef.current = transformState; }, [transformState]);

  // Notify parent whenever any save completes (auto-save, manual, name-modal)
  const onSavedRef = useRef(onSaved);
  useEffect(() => { onSavedRef.current = onSaved; }, [onSaved]);
  useEffect(() => { if (autoSaveStatus === 'saved') onSavedRef.current?.(); }, [autoSaveStatus]);

  // Call BEFORE any mutation to snapshot the current state
  const pushHistory = useCallback(() => {
    const snap = { boxes: boxesRef.current, buyoffIcons: buyoffRef.current, connections: connsRef.current, textLabels: textLabelsRef.current, canvasArrows: canvasArrowsRef.current };
    undoStackRef.current = [...undoStackRef.current.slice(-49), snap];
    redoStackRef.current = [];
  }, []);

  // Ref so the keyboard handler always calls the latest version
  const pushHistoryRef = useRef(pushHistory);
  useEffect(() => { pushHistoryRef.current = pushHistory; }, [pushHistory]);

  const handleUndo = useCallback(() => {
    if (undoStackRef.current.length === 0) return;
    const prev = undoStackRef.current[undoStackRef.current.length - 1];
    undoStackRef.current = undoStackRef.current.slice(0, -1);
    redoStackRef.current = [
      { boxes: boxesRef.current, buyoffIcons: buyoffRef.current, connections: connsRef.current, textLabels: textLabelsRef.current, canvasArrows: canvasArrowsRef.current },
      ...redoStackRef.current.slice(0, 49),
    ];
    isLoadingRef.current = true;
    setBoxes(prev.boxes);
    setBuyoffIcons(prev.buyoffIcons);
    setConnections(prev.connections);
    setTextLabels(prev.textLabels || []);
    setCanvasArrows(prev.canvasArrows || []);
    setTimeout(() => { isLoadingRef.current = false; }, 50);
  }, []);

  const handleRedo = useCallback(() => {
    if (redoStackRef.current.length === 0) return;
    const next = redoStackRef.current[0];
    redoStackRef.current = redoStackRef.current.slice(1);
    undoStackRef.current = [
      ...undoStackRef.current.slice(-49),
      { boxes: boxesRef.current, buyoffIcons: buyoffRef.current, connections: connsRef.current, textLabels: textLabelsRef.current, canvasArrows: canvasArrowsRef.current },
    ];
    isLoadingRef.current = true;
    setBoxes(next.boxes);
    setBuyoffIcons(next.buyoffIcons);
    setConnections(next.connections);
    setTextLabels(next.textLabels || []);
    setCanvasArrows(next.canvasArrows || []);
    setTimeout(() => { isLoadingRef.current = false; }, 50);
  }, []);

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
      const h = 5 * GRID; // boxSize height is always 200px
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
        pushHistoryRef.current();
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

  // Add text label when parent signals it
  useEffect(() => {
    if (addTextSignal > 0) handleAddTextLabel();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addTextSignal]);

  // Add arrow when parent signals it
  useEffect(() => {
    if (addArrowSignal > 0) handleAddArrow();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addArrowSignal]);

  // ── Box actions ─────────────────────────────────────────────────────────────
  const handleAddBox = useCallback((boxData) => {
    pushHistory();
    const id = uid();
    setBoxes((prev) => {
      const baseStationData = boxData.stationData || {};
      const extra = {};
      if (boxData.description) extra.__box_desc__ = boxData.description;
      const newBox = {
        id,
        dbId: null,
        name: boxData.name,
        stationIds: boxData.stationIds,
        stationNames: boxData.stationNames || [],   // top-level field
        stationData: { ...baseStationData, ...extra },
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
    pushHistory();
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
    pushHistory();
    setBoxes((prev) => prev.filter((b) => b.id !== id));
    setConnections((prev) => prev.filter((c) => c.fromId !== id && c.toId !== id));
    setSelectedIds((prev) => prev.filter((sid) => sid !== id));
  }, []);

  // ── Selection ────────────────────────────────────────────────────────────────
  const handleBoxSelect = useCallback((id, multi) => {
    setSelectedIds((prev) => {
      if (multi) {
        return prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id];
      }
      // Single click: deselect if already sole selection, else select only this
      return prev.length === 1 && prev[0] === id ? [] : [id];
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds([]), []);

  // ── Copy selected boxes ───────────────────────────────────────────────────────
  const handleCopySelected = useCallback(() => {
    if (selectedIds.length === 0) return;
    const toCopy = boxes.filter((b) => selectedIds.includes(b.id));
    setClipboard(toCopy);
  }, [selectedIds, boxes]);

  // ── Paste clipboard ───────────────────────────────────────────────────────────
  const handlePaste = useCallback(() => {
    if (!clipboard || clipboard.length === 0) return;
    pushHistory();
    const OFFSET = GRID * 2; // 80px offset so pasted boxes are visually distinct
    setBoxes((prev) => {
      let updated = [...prev];
      const newIds = [];
      for (const src of clipboard) {
        const id = uid();
        newIds.push(id);
        const rawPos = { x: src.position.x + OFFSET, y: src.position.y + OFFSET };
        const position = findValidPos(
          { ...src, id, stationCount: src.stationIds.length },
          rawPos,
          updated,
        );
        updated = [...updated, { ...src, id, dbId: null, position }];
      }
      // Select the newly pasted boxes
      setSelectedIds(newIds);
      return updated;
    });
  }, [clipboard]);

  // ── Delete selected boxes ─────────────────────────────────────────────────────
  const handleDeleteSelected = useCallback(() => {
    if (selectedIds.length === 0) return;
    pushHistory();
    setBoxes((prev) => prev.filter((b) => !selectedIds.includes(b.id)));
    setConnections((prev) =>
      prev.filter((c) => !selectedIds.includes(c.fromId.split('__')[0]) && !selectedIds.includes(c.toId.split('__')[0]))
    );
    setSelectedIds([]);
  }, [selectedIds]);

  const handleBoxNameChange = useCallback((id, newName) => {
    pushHistory();
    setBoxes((prev) => prev.map((b) => b.id === id ? { ...b, name: newName } : b));
  }, [pushHistory]);

  const handleBoxDescriptionChange = useCallback((id, newDesc) => {
    pushHistory();
    setBoxes((prev) => prev.map((b) => {
      if (b.id !== id) return b;
      return {
        ...b,
        stationData: { ...b.stationData, __box_desc__: newDesc },
      };
    }));
  }, [pushHistory]);

  const handleBoxStationNamesChange = useCallback((id, newNames) => {
    pushHistory();
    setBoxes((prev) => prev.map((b) =>
      b.id !== id ? b : { ...b, stationNames: newNames }
    ));
  }, []);

  const handleBoxStationIdChange = useCallback((boxId, stationIndex, newSid) => {
    const targetBox = boxes.find((b) => b.id === boxId);
    if (!targetBox) return;
    const oldSid = targetBox.stationIds[stationIndex];
    if (!newSid || newSid === oldSid) return;
    pushHistory();

    setBoxes((prev) => prev.map((b) => {
      if (b.id !== boxId) return b;
      const newIds = [...b.stationIds];
      newIds[stationIndex] = newSid;
      // Rename stationData key if present
      const newStationData = { ...b.stationData };
      if (oldSid in newStationData) {
        newStationData[newSid] = newStationData[oldSid];
        delete newStationData[oldSid];
      }
      return { ...b, stationIds: newIds, stationData: newStationData };
    }));

    // Update any connections that referenced the old station port IDs
    const oldTop    = `${boxId}__${oldSid}`;
    const oldBottom = `${boxId}__${oldSid}__b`;
    const newTop    = `${boxId}__${newSid}`;
    const newBottom = `${boxId}__${newSid}__b`;
    setConnections((prev) => prev.map((c) => ({
      ...c,
      fromId: c.fromId === oldTop ? newTop : c.fromId === oldBottom ? newBottom : c.fromId,
      toId:   c.toId   === oldTop ? newTop : c.toId   === oldBottom ? newBottom : c.toId,
    })));
  }, [boxes]);

  // ── Buyoff icon actions ─────────────────────────────────────────────────────
  const handleAddBuyoff = useCallback(() => {
    pushHistory();
    const id = uid();
    setBuyoffIcons((prev) => [
      ...prev,
      { id, dbId: null, position: { x: snapBypass(GRID + prev.length * GRID * 2), y: snapBypass(GRID) }, name: '' },
    ]);
  }, []);

  const handleBuyoffNameChange = useCallback((id, newName) => {
    setBuyoffIcons((prev) => prev.map((b) => (b.id === id ? { ...b, name: newName } : b)));
  }, []);

  // ── Text label actions ──────────────────────────────────────────────────────
  const handleAddTextLabel = useCallback(() => {
    pushHistory();
    const id = uid();
    const { positionX, positionY, scale } = transformStateRef.current;
    const cw = canvasRef.current?.clientWidth  || 800;
    const ch = canvasRef.current?.clientHeight || 600;
    const W = 160, H = 56;
    const baseCx = Math.max(GRID, Math.round((-positionX + cw / 2) / scale) - W / 2);
    const baseCy = Math.max(GRID, Math.round((-positionY + ch / 2) / scale) - H / 2);
    const { x, y } = findClearSpot(baseCx, baseCy, W, H, boxesRef.current);
    setTextLabels((prev) => [...prev, { id, text: '', x, y, w: W, h: H }]);
  }, [pushHistory]);

  const handleTextLabelPositionChange = useCallback((id, pos) => {
    setTextLabels((prev) => prev.map((t) => (t.id === id ? { ...t, x: pos.x, y: pos.y } : t)));
  }, []);

  const handleTextLabelSizeChange = useCallback((id, newSize) => {
    setTextLabels((prev) => prev.map((t) => (t.id === id ? { ...t, w: newSize.w, h: newSize.h } : t)));
  }, []);

  const handleTextLabelTextChange = useCallback((id, text) => {
    setTextLabels((prev) => prev.map((t) => (t.id === id ? { ...t, text } : t)));
  }, []);

  const handleDeleteTextLabel = useCallback((id) => {
    pushHistory();
    setTextLabels((prev) => prev.filter((t) => t.id !== id));
  }, [pushHistory]);

  // ── Canvas arrow actions ────────────────────────────────────────────────────
  const handleAddArrow = useCallback(() => {
    pushHistory();
    const id = uid();
    const { positionX, positionY, scale } = transformStateRef.current;
    const cw = canvasRef.current?.clientWidth  || 800;
    const ch = canvasRef.current?.clientHeight || 600;
    const W = 120, H = 50;
    // Offset base slightly below centre so text and arrow don't land on the same spot
    const baseCx = Math.max(GRID, Math.round((-positionX + cw / 2) / scale) - W / 2);
    const baseCy = Math.max(GRID, Math.round((-positionY + ch / 2) / scale) + 2 * GRID);
    const { x, y } = findClearSpot(baseCx, baseCy, W, H, boxesRef.current);
    setCanvasArrows((prev) => [...prev, { id, direction: 'right', label: '', x, y, w: W, h: H }]);
  }, [pushHistory]);

  const handleArrowSizeChange = useCallback((id, newSize) => {
    setCanvasArrows((prev) => prev.map((a) => (a.id === id ? { ...a, w: newSize.w, h: newSize.h } : a)));
  }, []);

  const handleArrowPositionChange = useCallback((id, pos) => {
    setCanvasArrows((prev) => prev.map((a) => (a.id === id ? { ...a, x: pos.x, y: pos.y } : a)));
  }, []);

  const handleArrowDirectionChange = useCallback((id, direction) => {
    setCanvasArrows((prev) => prev.map((a) => (a.id === id ? { ...a, direction } : a)));
  }, []);

  const handleArrowLabelChange = useCallback((id, label) => {
    setCanvasArrows((prev) => prev.map((a) => (a.id === id ? { ...a, label } : a)));
  }, []);

  const handleDeleteArrow = useCallback((id) => {
    pushHistory();
    setCanvasArrows((prev) => prev.filter((a) => a.id !== id));
  }, [pushHistory]);

  const handleBuyoffPositionChange = useCallback((id, rawPos) => {
    pushHistory();
    const snapped = { x: snapBypass(rawPos.x), y: snapBypass(rawPos.y) };
    setBuyoffIcons((prev) => prev.map((b) => (b.id === id ? { ...b, position: snapped } : b)));
  }, []);

  const handleDeleteBuyoff = useCallback((id) => {
    pushHistory();
    setBuyoffIcons((prev) => prev.filter((b) => b.id !== id));
    setConnections((prev) => prev.filter((c) => c.fromId !== id && c.toId !== id));
  }, []);

  // ── Delete connection ────────────────────────────────────────────────────────
  const handleDeleteConnection = useCallback((connId) => {
    pushHistory();
    setConnections((prev) => prev.filter((c) => c.id !== connId));
  }, [pushHistory]);

  // ── Save layout ─────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    // For new layouts, ensure the name is unique (guards against modal-cancel → manual save)
    const nameToSave = !currentLayoutId
      ? uniqueLayoutName(layoutName || 'New Layout', savedLayoutsRef.current)
      : layoutName;
    if (nameToSave !== layoutName) setLayoutName(nameToSave);

    const payload = {
      name: nameToSave,
      text_labels: JSON.stringify(textLabels.map(({ id, text, x, y, w, h }) => ({ id, text, x, y, w, h }))),
      canvas_arrows: JSON.stringify(canvasArrows.map(({ id, direction, label, x, y, w, h }) => ({ id, direction, label, x, y, w, h }))),
      boxes: boxes.map((b) => ({
        local_id: b.id,
        name: b.name,
        prefix: b.stationIds?.[0]?.split('-')[0] ?? 'ST',
        station_count: b.stationIds?.length ?? 0,
        station_ids: b.stationIds?.join(','),
        station_data: JSON.stringify(
          b.stationNames?.length
            ? { ...b.stationData, __station_names__: b.stationNames }
            : (b.stationData ?? {})
        ),
        position_x: b.position.x,
        position_y: b.position.y,
        order_index: b.orderIndex,
      })),
      buyoff_icons: buyoffIcons.map((ic) => ({
        local_id: ic.id,
        position_x: ic.position.x,
        position_y: ic.position.y,
        name: ic.name || '',
      })),
      connections: connections.map((c) => ({
        from_local_id: c.fromId,
        to_local_id: c.toId,
      })),
    };

    // Clear dirty before async — any mutation during save will set it back to true
    isDirtyRef.current = false;
    try {
      let response;
      if (currentLayoutId) {
        response = await layoutApi.updateSnapshot(currentLayoutId, payload);
      } else {
        response = await layoutApi.createSnapshot(payload, userId);
      }
      const saved = response.data;
      setCurrentLayoutId(saved.id);

      if (!isDirtyRef.current) {
        // Nothing changed during save — safe to sync from server response
        isLoadingRef.current = true;
        const rebuilt = stateFromApi(saved);
        setBoxes(rebuilt.boxes);
        setBuyoffIcons(rebuilt.buyoffIcons);
        setConnections(rebuilt.connections);
        setTextLabels(rebuilt.textLabels || []);
        setCanvasArrows(rebuilt.canvasArrows || []);
        setLayoutName(saved.name);
        setTimeout(() => { isLoadingRef.current = false; }, 100);
      } else {
        // A mutation (e.g. delete) happened while saving — schedule a re-save
        // to persist those changes without overwriting the current state
        autoSaveTimerRef.current = setTimeout(async () => {
          if (isSavingRef.current || isLoadingRef.current) return;
          isSavingRef.current = true;
          setAutoSaveStatus('saving');
          const ok2 = await handleSaveRef.current();
          isSavingRef.current = false;
          setAutoSaveStatus(ok2 ? 'saved' : 'error');
          if (ok2) setTimeout(() => setAutoSaveStatus((s) => s === 'saved' ? 'idle' : s), 2000);
        }, 500);
      }
      return true;
    } catch (err) {
      console.error('Save failed:', err);
      isDirtyRef.current = true; // restore dirty so next attempt re-sends
      return false;
    }
  }, [layoutName, boxes, buyoffIcons, connections, textLabels, canvasArrows, currentLayoutId, userId]);

  // ── Load layout ─────────────────────────────────────────────────────────────
  const handleLoad = useCallback(async (layoutId) => {
    isLoadingRef.current = true;
    nameModalShownRef.current = false; // allow name modal again if user clears and re-adds
    // Fresh load = fresh history (nothing to undo back to)
    undoStackRef.current = [];
    redoStackRef.current = [];
    try {
      const response = await layoutApi.getLayout(layoutId);
      const data = response.data;
      const rebuilt = stateFromApi(data);
      setBoxes(rebuilt.boxes);
      setBuyoffIcons(rebuilt.buyoffIcons);
      setConnections(rebuilt.connections);
      setTextLabels(rebuilt.textLabels || []);
      setCanvasArrows(rebuilt.canvasArrows || []);
      setLayoutName(data.name);
      setCurrentLayoutId(data.id);
      isDirtyRef.current = false;
      setAutoSaveStatus('idle');
      setTimeout(() => {
        isLoadingRef.current = false;
        fitView(rebuilt.boxes, rebuilt.buyoffIcons);
      }, 100);
    } catch (err) {
      console.error('Load failed:', err);
      isLoadingRef.current = false;
    }
  }, [fitView]);

  // ── Copy layout ─────────────────────────────────────────────────────────────
  const handleCopyLayout = useCallback(async () => {
    if (boxes.length === 0 && buyoffIcons.length === 0) return;
    const copyName = `Copy of ${layoutName}`;
    const payload = {
      name: copyName,
      text_labels: JSON.stringify(textLabels.map(({ id, text, x, y, w, h }) => ({ id, text, x, y, w, h }))),
      canvas_arrows: JSON.stringify(canvasArrows.map(({ id, direction, label, x, y, w, h }) => ({ id, direction, label, x, y, w, h }))),
      boxes: boxes.map((b) => ({
        local_id: b.id,
        name: b.name,
        prefix: b.stationIds?.[0]?.split('-')[0] ?? 'ST',
        station_count: b.stationIds?.length ?? 0,
        station_ids: b.stationIds?.join(','),
        station_data: JSON.stringify(
          b.stationNames?.length
            ? { ...b.stationData, __station_names__: b.stationNames }
            : (b.stationData ?? {})
        ),
        position_x: b.position.x,
        position_y: b.position.y,
        order_index: b.orderIndex,
      })),
      buyoff_icons: buyoffIcons.map((ic) => ({
        local_id: ic.id,
        position_x: ic.position.x,
        position_y: ic.position.y,
        name: ic.name || '',
      })),
      connections: connections.map((c) => ({
        from_local_id: c.fromId,
        to_local_id: c.toId,
      })),
    };
    try {
      isLoadingRef.current = true;
      setAutoSaveStatus('saving');
      const response = await layoutApi.createSnapshot(payload, userId);
      const saved = response.data;
      setCurrentLayoutId(saved.id);
      const rebuilt = stateFromApi(saved);
      setBoxes(rebuilt.boxes);
      setBuyoffIcons(rebuilt.buyoffIcons);
      setConnections(rebuilt.connections);
      setTextLabels(rebuilt.textLabels || []);
      setCanvasArrows(rebuilt.canvasArrows || []);
      setLayoutName(saved.name);
      isDirtyRef.current = false;
      nameModalShownRef.current = false;
      setTimeout(() => { isLoadingRef.current = false; }, 100);
      setAutoSaveStatus('saved');
      setTimeout(() => setAutoSaveStatus((s) => s === 'saved' ? 'idle' : s), 2000);
      return saved.id;
    } catch (err) {
      console.error('Copy failed:', err);
      isLoadingRef.current = false;
      setAutoSaveStatus('error');
      return null;
    }
  }, [layoutName, boxes, buyoffIcons, connections, textLabels, canvasArrows, userId]);

  // ── Clear all ───────────────────────────────────────────────────────────────
  const handleClearAll = () => {
    if (window.confirm('Clear the canvas? (Saved layouts are not deleted.)')) {
      undoStackRef.current = [];
      redoStackRef.current = [];
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

  useEffect(() => {
    if (onCopyLayout) onCopyLayout(handleCopyLayout);
  }, [handleCopyLayout, onCopyLayout]);

  // ── Keyboard shortcuts: Ctrl+Z / Ctrl+Y / Ctrl+C / Ctrl+V / Delete / Escape ──
  useEffect(() => {
    const onKey = (e) => {
      // Ignore when typing in an input or textarea
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
        e.preventDefault();
        handleRedo();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        e.preventDefault();
        handleCopySelected();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        e.preventDefault();
        handlePaste();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedIds.length > 0) { e.preventDefault(); handleDeleteSelected(); }
      } else if (e.key === 'Escape') {
        clearSelection();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleUndo, handleRedo, handleCopySelected, handlePaste, handleDeleteSelected, clearSelection, selectedIds]);

  // Keep ref always pointing to latest handleSave (avoids stale closure in timer)
  useEffect(() => { handleSaveRef.current = handleSave; }, [handleSave]);

  // ── Auto-save: debounce 1.5s after any canvas change ────────────────────────
  useEffect(() => {
    if (boxes.length === 0 && buyoffIcons.length === 0 && connections.length === 0) return;
    // Always mark dirty so deletions during a save are not lost
    isDirtyRef.current = true;
    if (isLoadingRef.current || isSavingRef.current) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);

    if (currentLayoutId) {
      setAutoSaveStatus('pending');
      autoSaveTimerRef.current = setTimeout(async () => {
        if (isSavingRef.current || isLoadingRef.current) return;
        isSavingRef.current = true;
        setAutoSaveStatus('saving');
        const ok = await handleSaveRef.current();
        isSavingRef.current = false;
        setAutoSaveStatus(ok ? 'saved' : 'error');
        if (ok) setTimeout(() => setAutoSaveStatus((s) => s === 'saved' ? 'idle' : s), 2000);
      }, 1500);
    } else if (!nameModalShownRef.current) {
      // New layout — prompt for a name before first save
      nameModalShownRef.current = true;
      setNameDraft(uniqueLayoutName('New Layout', savedLayoutsRef.current));
      setShowNameModal(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boxes, buyoffIcons, connections, textLabels, canvasArrows, currentLayoutId]);

  // ── Save immediately when user leaves the tab / page ────────────────────────
  useEffect(() => {
    const flush = () => {
      if (!isDirtyRef.current || isSavingRef.current || isLoadingRef.current) return;
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      handleSaveRef.current?.();
    };
    document.addEventListener('visibilitychange', flush);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', flush);
      window.removeEventListener('pagehide', flush);
    };
  }, []);

  // ── Name-modal confirm handler ───────────────────────────────────────────────
  const handleNameModalConfirm = useCallback(async () => {
    const trimmed = nameDraft.trim();
    if (!trimmed) return;
    setShowNameModal(false);
    setLayoutName(trimmed);
    // Save immediately using the trimmed name directly (bypass stale layoutName closure)
    isSavingRef.current = true;
    setAutoSaveStatus('saving');
    try {
      const payload = {
        name: trimmed,
        text_labels: JSON.stringify(textLabels.map(({ id, text, x, y, w, h }) => ({ id, text, x, y, w, h }))),
      canvas_arrows: JSON.stringify(canvasArrows.map(({ id, direction, label, x, y, w, h }) => ({ id, direction, label, x, y, w, h }))),
        boxes: boxes.map((b) => ({
          local_id: b.id,
          name: b.name,
          prefix: b.stationIds?.[0]?.split('-')[0] ?? 'ST',
          station_count: b.stationIds?.length ?? 0,
          station_ids: b.stationIds?.join(','),
          station_data: JSON.stringify(
          b.stationNames?.length
            ? { ...b.stationData, __station_names__: b.stationNames }
            : (b.stationData ?? {})
        ),
          position_x: b.position.x,
          position_y: b.position.y,
          order_index: b.orderIndex,
        })),
        buyoff_icons: buyoffIcons.map((ic) => ({
          local_id: ic.id,
          position_x: ic.position.x,
          position_y: ic.position.y,
          name: ic.name || '',
        })),
        connections: connections.map((c) => ({
          from_local_id: c.fromId,
          to_local_id: c.toId,
        })),
      };
      const response = await layoutApi.createSnapshot(payload, userId);
      const saved = response.data;
      isLoadingRef.current = true;
      setCurrentLayoutId(saved.id);
      const rebuilt = stateFromApi(saved);
      setBoxes(rebuilt.boxes);
      setBuyoffIcons(rebuilt.buyoffIcons);
      setConnections(rebuilt.connections);
      setTextLabels(rebuilt.textLabels || []);
      setCanvasArrows(rebuilt.canvasArrows || []);
      setLayoutName(saved.name);
      isDirtyRef.current = false;
      setTimeout(() => { isLoadingRef.current = false; }, 100);
      setAutoSaveStatus('saved');
      setTimeout(() => setAutoSaveStatus((s) => s === 'saved' ? 'idle' : s), 2000);
    } catch (err) {
      console.error('Save failed:', err);
      setAutoSaveStatus('error');
    } finally {
      isSavingRef.current = false;
    }
  }, [nameDraft, boxes, buyoffIcons, connections, userId]);

  return (
    <>
    {/* Xwrapper wraps the whole component so Xarrow SVGs render in screen space
        (outside TransformComponent) — this is required for correct arrow positioning
        at any zoom/pan level, since Xarrow uses getBoundingClientRect() for coordinates. */}
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
                <span className="layout-name-edit-icon"><Pencil size={13} /></span>
              </h2>
            )}

            {/* Auto-save status indicator */}
            {autoSaveStatus === 'pending' && (
              <span className="autosave-badge autosave-badge--pending">
                <Cloud size={12} /> Unsaved changes
              </span>
            )}
            {autoSaveStatus === 'saving' && (
              <span className="autosave-badge autosave-badge--saving">
                <Cloud size={12} className="autosave-spin" /> Saving…
              </span>
            )}
            {autoSaveStatus === 'saved' && (
              <span className="autosave-badge autosave-badge--saved">
                <Check size={12} /> Saved
              </span>
            )}
            {autoSaveStatus === 'error' && (
              <span className="autosave-badge autosave-badge--error">
                <AlertCircle size={12} /> Save failed
              </span>
            )}
          </div>

          <div className="layout-toolbar-right">
            {selectedIds.length > 0 ? (
              <div className="selection-bar">
                <span className="selection-bar-count">
                  {selectedIds.length} box{selectedIds.length !== 1 ? 'es' : ''} selected
                </span>
                <button className="selection-bar-btn" onClick={handleCopySelected} title="Copy (Ctrl+C)">
                  Copy
                </button>
                {clipboard && (
                  <button className="selection-bar-btn selection-bar-btn--paste" onClick={handlePaste} title="Paste (Ctrl+V)">
                    Paste
                  </button>
                )}
                <button className="selection-bar-btn selection-bar-btn--delete" onClick={handleDeleteSelected} title="Delete (Del)">
                  Delete
                </button>
                <button className="selection-bar-btn selection-bar-btn--deselect" onClick={clearSelection} title="Deselect (Esc)">
                  ✕ Deselect
                </button>
              </div>
            ) : (
              <>
                <span className="layout-connect-hint">
                  {clipboard
                    ? `Clipboard: ${clipboard.length} box${clipboard.length !== 1 ? 'es' : ''} · Ctrl+V to paste`
                    : 'Drag from a port dot to connect · Click box to select'}
                </span>
                {clipboard && (
                  <button className="toolbar-btn toolbar-btn--paste" onClick={handlePaste} title="Paste (Ctrl+V)">
                    Paste ({clipboard.length})
                  </button>
                )}
              </>
            )}
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
            panning={{ excluded: ['station-box-drag-handle--fill', 'buyoff-drag-handle', 'station-port', 'buyoff-port', 'ctl-wrap', 'ca-wrap'] }}
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
                    onClick={(e) => { if (e.target === e.currentTarget) clearSelection(); }}
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

                    {textLabels.map((tl) => (
                      <CanvasTextLabel
                        key={tl.id}
                        id={tl.id}
                        position={{ x: tl.x, y: tl.y }}
                        size={{ w: tl.w || 160, h: tl.h || 56 }}
                        text={tl.text}
                        onPositionChange={handleTextLabelPositionChange}
                        onSizeChange={handleTextLabelSizeChange}
                        onTextChange={handleTextLabelTextChange}
                        onDelete={handleDeleteTextLabel}
                        canvasScale={canvasScale}
                      />
                    ))}

                    {canvasArrows.map((arrow) => (
                      <CanvasArrow
                        key={arrow.id}
                        id={arrow.id}
                        position={{ x: arrow.x, y: arrow.y }}
                        size={{ w: arrow.w || 120, h: arrow.h || 50 }}
                        direction={arrow.direction}
                        label={arrow.label}
                        onPositionChange={handleArrowPositionChange}
                        onSizeChange={handleArrowSizeChange}
                        onDirectionChange={handleArrowDirectionChange}
                        onLabelChange={handleArrowLabelChange}
                        onDelete={handleDeleteArrow}
                        canvasScale={canvasScale}
                      />
                    ))}

                    {boxes.map((box) => (
                      <StationBox
                        key={box.id}
                        id={box.id}
                        name={box.name}
                        stationIds={box.stationIds}
                        stationNames={box.stationNames || []}
                        stationData={box.stationData}
                        description={box.stationData?.__box_desc__ || ''}
                        position={box.position}
                        onPositionChange={handleBoxPositionChange}
                        onDelete={handleDeleteBox}
                        onPortMouseDown={handlePortMouseDown}
                        onNameChange={handleBoxNameChange}
                        onDescriptionChange={handleBoxDescriptionChange}
                        onStationNamesChange={handleBoxStationNamesChange}
                        onStationIdChange={handleBoxStationIdChange}
                        onSelect={handleBoxSelect}
                        isSelected={selectedIds.includes(box.id)}
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

        {/* ── Layout Name Modal (first-time save) ─────────────────────────── */}
        {showNameModal && (
          <div className="lnm-overlay" onClick={() => setShowNameModal(false)}>
            <div className="lnm-modal" onClick={(e) => e.stopPropagation()}>
              <div className="lnm-header">
                <span className="lnm-title">Name your layout</span>
                <button className="lnm-close" onClick={() => setShowNameModal(false)}><X size={14} /></button>
              </div>
              <div className="lnm-body">
                <label className="lnm-label">Layout name</label>
                <input
                  className="lnm-input"
                  type="text"
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleNameModalConfirm();
                    if (e.key === 'Escape') setShowNameModal(false);
                  }}
                  placeholder="e.g. TRIM Line — Assembly A"
                  maxLength={80}
                  autoFocus
                />
              </div>
              <div className="lnm-footer">
                <button className="lnm-btn lnm-btn--cancel" onClick={() => setShowNameModal(false)}>Cancel</button>
                <button
                  className="lnm-btn lnm-btn--save"
                  onClick={handleNameModalConfirm}
                  disabled={!nameDraft.trim()}
                >
                  Save Layout
                </button>
              </div>
            </div>
          </div>
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
    <HelpGuide {...LAYOUT_HELP} />
    </>
  );
}

export default LayoutPreparation;
