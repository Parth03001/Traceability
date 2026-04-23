import React, { useState, useRef, useEffect, useCallback } from 'react';
import Draggable from 'react-draggable';
import { Check, X } from 'lucide-react';
import './CanvasTextLabel.css';

const MIN_W = 80;
const MIN_H = 32;

export default function CanvasTextLabel({
  id,
  position: parentPos,
  size: parentSize,
  text: parentText,
  onPositionChange,
  onSizeChange,
  onTextChange,
  onDelete,
  canvasScale,
}) {
  const [pos,      setPos     ] = useState(parentPos  || { x: 40, y: 40 });
  const [size,     setSize    ] = useState(parentSize || { w: 160, h: 56 });
  const [text,     setText    ] = useState(parentText || '');
  const [selected, setSelected] = useState(false);

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

  useEffect(() => { setText(parentText || ''); }, [parentText]);

  /* ── Auto-focus textarea on select ──────────────────────────────────── */
  useEffect(() => {
    if (selected) setTimeout(() => wrapRef.current?.querySelector('textarea')?.focus(), 0);
  }, [selected]);

  /* ── Click-outside → deselect; auto-delete if still empty ───────────── */
  useEffect(() => {
    if (!selected) return;
    const h = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setSelected(false);
        const trimmed = text.trim();
        if (!trimmed) onDelete?.(id);
        else onTextChange?.(id, trimmed);
      }
    };
    document.addEventListener('mousedown', h, true);
    return () => document.removeEventListener('mousedown', h, true);
  }, [selected, id, text, onTextChange, onDelete]);

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

  const handleOk = (e) => {
    e.stopPropagation();
    setSelected(false);
    const trimmed = text.trim();
    if (!trimmed) onDelete?.(id);
    else onTextChange?.(id, trimmed);
  };

  const isEmpty = !text.trim();

  /* Font size scales proportionally with box height so resize = resize text */
  const fontSize = Math.max(7, Math.round(size.h * 0.22));

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
      cancel=".ctl-rz,.ctl-toolbar"
    >
      <div
        ref={wrapRef}
        className={`ctl-wrap${selected ? ' ctl-wrap--sel' : ''}${isEmpty ? ' ctl-wrap--empty' : ''}`}
        style={{ width: size.w, height: size.h }}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); if (!didDragRef.current) setSelected(true); }}
      >
        {/* ── Textarea — always full height, font scales with box ─────────── */}
        <textarea
          className="ctl-ta"
          style={{ fontSize }}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onMouseDown={(e) => { if (selected) e.stopPropagation(); }}
          onClick={(e) => { if (selected) e.stopPropagation(); }}
          placeholder="Type here…"
          readOnly={!selected}
          spellCheck={false}
        />

        {/* ── Floating toolbar (OK + Delete) ───────────────────────────────── */}
        {selected && (
          <div className="ctl-toolbar" onMouseDown={(e) => e.stopPropagation()}>
            <button className="ctl-ok" onClick={handleOk} title="Save & close">
              <Check size={9} /> OK
            </button>
            {onDelete && (
              <button className="ctl-del" onClick={(e) => { e.stopPropagation(); onDelete(id); }} title="Delete">
                <X size={9} />
              </button>
            )}
          </div>
        )}

        {/* ── Resize handles (8 dots) — shown on hover & selected via CSS ─── */}
        {['nw','n','ne','e','se','s','sw','w'].map((c) => (
          <div
            key={c}
            className={`ctl-rz ctl-rz--${c}`}
            style={{ cursor: CURSORS[c] }}
            onMouseDown={(e) => beginResize(c, e)}
          />
        ))}
      </div>
    </Draggable>
  );
}
