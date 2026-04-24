import React, { useState, useRef, useEffect, useCallback } from 'react';
import Draggable from 'react-draggable';
import { Check, X, RotateCw } from 'lucide-react';
import './CanvasArrow.css';

const MIN_W = 36;
const MIN_H = 16;

const DIRECTIONS = ['right', 'down', 'left', 'up'];
const DIR_DEG = { right: 0, down: 90, left: 180, up: 270 };

export default function CanvasArrow({
  id,
  position: parentPos,
  size: parentSize,
  direction: parentDir = 'right',
  label: parentLabel = '',
  onPositionChange,
  onSizeChange,
  onDirectionChange,
  onLabelChange,
  onDelete,
  canvasScale,
}) {
  const [pos,       setPos      ] = useState(parentPos   || { x: 80, y: 80 });
  const [size,      setSize     ] = useState(parentSize  || { w: 120, h: 50 });
  const [direction, setDir      ] = useState(parentDir);
  const [label,     setLabel    ] = useState(parentLabel);
  const [selected,  setSelected ] = useState(false);

  const wrapRef    = useRef(null);
  const iRef       = useRef(null);   // active resize interaction
  const didDragRef = useRef(false);  // distinguish drag from click

  /* ── Sync from parent ─────────────────────────────────────────────────── */
  useEffect(() => {
    if (parentPos && (parentPos.x !== pos.x || parentPos.y !== pos.y)) setPos(parentPos);
  }, [parentPos?.x, parentPos?.y]); // eslint-disable-line

  useEffect(() => {
    if (parentSize && (parentSize.w !== size.w || parentSize.h !== size.h)) setSize(parentSize);
  }, [parentSize?.w, parentSize?.h]); // eslint-disable-line

  useEffect(() => { setDir(parentDir); },     [parentDir]);
  useEffect(() => { setLabel(parentLabel); }, [parentLabel]);

  /* ── Click-outside → deselect & save ────────────────────────────────── */
  useEffect(() => {
    if (!selected) return;
    const h = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setSelected(false);
        onLabelChange?.(id, label);
      }
    };
    document.addEventListener('mousedown', h, true);
    return () => document.removeEventListener('mousedown', h, true);
  }, [selected, id, label, onLabelChange]);

  /* ── Resize (custom; Draggable cancel prevents its own drag on handles) ─ */
  const onResizeMove = useCallback((e) => {
    const d = iRef.current;
    if (!d) return;
    const sc = canvasScale || 1;
    const dx = (e.clientX - d.cx0) / sc;
    const dy = (e.clientY - d.cy0) / sc;
    let x = d.px0, y = d.py0, w = d.w0, h = d.h0;
    if (d.c.includes('e')) w = Math.max(MIN_W, d.w0 + dx);
    if (d.c.includes('w')) { w = Math.max(MIN_W, d.w0 - dx); x = d.px0 + d.w0 - w; }
    if (d.c.includes('s')) h = Math.max(MIN_H, d.h0 + dy);
    if (d.c.includes('n')) { h = Math.max(MIN_H, d.h0 - dy); y = d.py0 + d.h0 - h; }
    setPos({ x, y });
    setSize({ w, h });
  }, [canvasScale]);

  const onResizeUp = useCallback((e) => {
    const d = iRef.current;
    if (!d) return;
    iRef.current = null;
    window.removeEventListener('mousemove', onResizeMove);
    window.removeEventListener('mouseup', onResizeUp);
    const sc = canvasScale || 1;
    const dx = (e.clientX - d.cx0) / sc;
    const dy = (e.clientY - d.cy0) / sc;
    let x = d.px0, y = d.py0, w = d.w0, h = d.h0;
    if (d.c.includes('e')) w = Math.max(MIN_W, d.w0 + dx);
    if (d.c.includes('w')) { w = Math.max(MIN_W, d.w0 - dx); x = d.px0 + d.w0 - w; }
    if (d.c.includes('s')) h = Math.max(MIN_H, d.h0 + dy);
    if (d.c.includes('n')) { h = Math.max(MIN_H, d.h0 - dy); y = d.py0 + d.h0 - h; }
    onPositionChange?.(id, { x, y });
    onSizeChange?.(id, { w, h });
  }, [id, canvasScale, onPositionChange, onSizeChange, onResizeMove]);

  const beginResize = (c, e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    iRef.current = {
      c,
      cx0: e.clientX, cy0: e.clientY,
      px0: pos.x,     py0: pos.y,
      w0:  size.w,    h0:  size.h,
    };
    window.addEventListener('mousemove', onResizeMove);
    window.addEventListener('mouseup', onResizeUp);
  };

  const rotate = (e) => {
    e.stopPropagation();
    const next = DIRECTIONS[(DIRECTIONS.indexOf(direction) + 1) % 4];
    // Swap w/h when crossing horizontal ↔ vertical so thickness & length stay consistent
    const wasVertical = direction === 'up' || direction === 'down';
    const isVertical  = next     === 'up' || next     === 'down';
    setDir(next);
    onDirectionChange?.(id, next);
    if (wasVertical !== isVertical) {
      const swapped = { w: size.h, h: size.w };
      setSize(swapped);
      onSizeChange?.(id, swapped);
    }
  };

  const handleOk = (e) => {
    e.stopPropagation();
    setSelected(false);
    onLabelChange?.(id, label);
  };

  const CURSORS = {
    nw: 'nwse-resize', n: 'ns-resize',  ne: 'nesw-resize',
    e:  'ew-resize',   se:'nwse-resize', s:  'ns-resize',
    sw: 'nesw-resize', w: 'ew-resize',
  };

  return (
    <Draggable
      nodeRef={wrapRef}
      position={pos}
      onStart={() => { didDragRef.current = false; }}
      onDrag={(e, data) => { didDragRef.current = true; setPos({ x: data.x, y: data.y }); }}
      onStop={(e, data) => {
        if (didDragRef.current) onPositionChange?.(id, { x: data.x, y: data.y });
      }}
      scale={canvasScale || 1}
      cancel=".ca-rz,.ca-toolbar"
    >
      <div
        ref={wrapRef}
        className={`ca-wrap${selected ? ' ca-wrap--sel' : ''}`}
        style={{ width: size.w, height: size.h }}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); if (!didDragRef.current) setSelected(true); }}
      >
        {/* ── Block arrow SVG — fills full bounding box ─────────────────── */}
        <svg
          className="ca-svg"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <polygon
            points="0,30 62,30 62,8 100,50 62,92 62,70 0,70"
            style={{
              transform: `rotate(${DIR_DEG[direction]}deg)`,
              transformOrigin: '50px 50px',
              transformBox: 'fill-box',
            }}
          />
        </svg>

        {/* ── Floating toolbar (Rotate + OK + Delete) ───────────────────── */}
        {selected && (
          <div className="ca-toolbar" onMouseDown={(e) => e.stopPropagation()}>
            <button className="ca-rotate" onClick={rotate} title="Rotate 90°">
              <RotateCw size={10} />
            </button>
            <button className="ca-ok" onClick={handleOk} title="Save & close">
              <Check size={9} /> OK
            </button>
            {onDelete && (
              <button className="ca-del" onClick={(e) => { e.stopPropagation(); onDelete(id); }} title="Delete">
                <X size={9} />
              </button>
            )}
          </div>
        )}

        {/* ── Resize handles (8 dots) — shown on hover & selected via CSS ─ */}
        {['nw','n','ne','e','se','s','sw','w'].map((c) => (
          <div
            key={c}
            className={`ca-rz ca-rz--${c}`}
            style={{ cursor: CURSORS[c] }}
            onMouseDown={(e) => beginResize(c, e)}
          />
        ))}
      </div>
    </Draggable>
  );
}
