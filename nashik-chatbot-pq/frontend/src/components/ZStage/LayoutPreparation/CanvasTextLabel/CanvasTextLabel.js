import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Draggable from 'react-draggable';
import { Check, X, Trash2 } from 'lucide-react';
import './CanvasTextLabel.css';

// S / M / L only controls font size — box width auto-fits text
const PRESETS = {
  S: { fs: 7  },
  M: { fs: 12 },
  L: { fs: 16 },
};

const MIN_W = 30;
const MIN_H = 14;

function detectPreset(w) {
  if (w <= 80)  return 'S';
  if (w <= 140) return 'M';
  return 'L';
}

// Measure the pixel width of the longest line at a given font size
function measureWidth(text, fontSize) {
  const ff   = getComputedStyle(document.body).fontFamily || 'Arial,sans-serif';
  const lines = (text || 'W').split('\n');
  const longest = lines.reduce((a, b) => (a.length >= b.length ? a : b), 'W');
  const span = document.createElement('span');
  span.style.cssText = (
    `position:fixed;top:-9999px;left:0;visibility:hidden;white-space:pre;` +
    `font-size:${fontSize}px;font-weight:700;font-family:${ff};`
  );
  span.textContent = longest;
  document.body.appendChild(span);
  const w = Math.max(MIN_W, Math.ceil(span.offsetWidth) + 4);
  document.body.removeChild(span);
  return w;
}

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
  const initPreset = detectPreset(parentSize?.w || 80);
  const initFS     = PRESETS[initPreset].fs;
  const initW      = parentSize?.w || measureWidth(parentText || '', initFS);
  const initH      = parentSize?.h || MIN_H;

  const [pos,     setPos    ] = useState(parentPos || { x: 40, y: 40 });
  const [size,    setSize   ] = useState({ w: initW, h: initH });
  const [text,    setText   ] = useState(parentText || '');
  const [editing, setEditing] = useState(false);
  const [preset,  setPreset ] = useState(initPreset);
  const [liveH,   setLiveH  ] = useState(null);
  const [liveW,   setLiveW  ] = useState(null);
  const [tbPos,   setTbPos  ] = useState(null);

  const wrapRef = useRef(null);
  const taRef   = useRef(null);
  const tbRef   = useRef(null);
  const dragRef = useRef(false);
  const origRef = useRef('');

  const fontSize = PRESETS[preset].fs;

  // Auto-size while editing: height from scrollHeight, width from longest-line measurement
  useEffect(() => {
    if (!editing || !taRef.current) return;
    // Height
    taRef.current.style.height = '1px';
    const sh = taRef.current.scrollHeight;
    taRef.current.style.height = '';
    setLiveH(Math.max(MIN_H, sh + 2));
    // Width
    setLiveW(measureWidth(text, fontSize));
  }, [text, editing, fontSize]);

  // Display size: live while editing, saved size otherwise
  const dispW = editing ? (liveW ?? size.w) : size.w;
  const dispH = editing ? (liveH ?? Math.max(size.h, MIN_H)) : size.h;

  // Focus on edit start
  useEffect(() => {
    if (!editing) return;
    origRef.current = text;
    setTimeout(() => {
      if (!taRef.current) return;
      taRef.current.focus();
      taRef.current.setSelectionRange(taRef.current.value.length, taRef.current.value.length);
    }, 0);
  }, [editing]); // eslint-disable-line

  // Sync from parent
  useEffect(() => { setText(parentText || ''); }, [parentText]);
  useEffect(() => {
    if (parentPos) setPos(parentPos);
  }, [parentPos?.x, parentPos?.y]); // eslint-disable-line

  // Toolbar position
  useEffect(() => {
    if (!editing) { setTbPos(null); return; }
    const update = () => {
      if (!wrapRef.current) return;
      const r = wrapRef.current.getBoundingClientRect();
      setTbPos({ top: r.top, left: r.left });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [editing, pos.x, pos.y, dispW, dispH]);

  // Save: commit live size (width fits text, height fits lines)
  const handleSave = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) { onDelete?.(id); return; }
    const finalW = measureWidth(trimmed, fontSize);
    const lines  = trimmed.split('\n').length;
    const finalH = Math.max(MIN_H, Math.ceil(lines * fontSize * 1.4) + 2);
    const final  = { w: finalW, h: finalH };
    setSize(final);
    setLiveW(null);
    setLiveH(null);
    setEditing(false);
    onTextChange?.(id, trimmed);
    onSizeChange?.(id, final);
  }, [id, text, fontSize, onDelete, onTextChange, onSizeChange]);

  const handleCancel = useCallback(() => {
    setEditing(false);
    setLiveW(null);
    setLiveH(null);
    const orig = origRef.current;
    if (!orig.trim()) { onDelete?.(id); return; }
    setText(orig);
    onTextChange?.(id, orig);
  }, [id, onDelete, onTextChange]);

  const handleDelete = useCallback(() => {
    setEditing(false);
    onDelete?.(id);
  }, [id, onDelete]);

  // S / M / L only changes font size — width/height recalculate automatically
  const applyPreset = (key) => setPreset(key);

  // Resize handles (manual override)
  const beginResize = (corner, e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const sc = canvasScale || 1;
    const s0 = { cx0: e.clientX, cy0: e.clientY, px0: pos.x, py0: pos.y, w0: size.w, h0: size.h };

    const calc = (ev) => {
      const dx = (ev.clientX - s0.cx0) / sc;
      const dy = (ev.clientY - s0.cy0) / sc;
      let x = s0.px0, y = s0.py0, w = s0.w0, h = s0.h0;
      if (corner.includes('e'))  w = Math.max(MIN_W, s0.w0 + dx);
      if (corner.includes('w')) { w = Math.max(MIN_W, s0.w0 - dx); x = s0.px0 + s0.w0 - w; }
      if (corner.includes('s'))  h = Math.max(MIN_H, s0.h0 + dy);
      if (corner.includes('n')) { h = Math.max(MIN_H, s0.h0 - dy); y = s0.py0 + s0.h0 - h; }
      return { x, y, w, h };
    };

    const onMove = (ev) => { const r = calc(ev); setPos({ x: r.x, y: r.y }); setSize({ w: r.w, h: r.h }); };
    const onUp   = (ev) => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      const r = calc(ev);
      setPos({ x: r.x, y: r.y });
      setSize({ w: r.w, h: r.h });
      onPositionChange?.(id, { x: r.x, y: r.y });
      onSizeChange?.(id, { w: r.w, h: r.h });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const CURSORS = {
    nw: 'nwse-resize', n: 'ns-resize',  ne: 'nesw-resize', e: 'ew-resize',
    se: 'nwse-resize', s: 'ns-resize',  sw: 'nesw-resize', w: 'ew-resize',
  };

  const toolbar = editing && tbPos && createPortal(
    <div
      ref={tbRef}
      className="ctl-toolbar"
      style={{ position: 'fixed', top: Math.max(4, tbPos.top - 40), left: tbPos.left, zIndex: 9999 }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {['S', 'M', 'L'].map((k) => (
        <button
          key={k}
          className={`ctl-preset${preset === k ? ' ctl-preset--active' : ''}`}
          onClick={() => applyPreset(k)}
        >
          {k}
        </button>
      ))}
      <div className="ctl-sep" />
      <button className="ctl-ok"     onClick={(e) => { e.stopPropagation(); handleSave();   }}><Check size={9} /> Save</button>
      <button className="ctl-cancel" onClick={(e) => { e.stopPropagation(); handleCancel(); }}><X size={9} /> Cancel</button>
      <div className="ctl-sep" />
      <button className="ctl-delete" onClick={(e) => { e.stopPropagation(); handleDelete(); }}><Trash2 size={9} /></button>
    </div>,
    document.body
  );

  return (
    <>
      <Draggable
        nodeRef={wrapRef}
        position={pos}
        onStart={() => { dragRef.current = false; }}
        onDrag={(_, d) => { dragRef.current = true; setPos({ x: d.x, y: d.y }); }}
        onStop={(_, d) => { if (dragRef.current) onPositionChange?.(id, { x: d.x, y: d.y }); }}
        scale={canvasScale || 1}
        cancel=".ctl-rz"
      >
        <div
          ref={wrapRef}
          className={`ctl-wrap${editing ? ' ctl-editing' : ''}`}
          style={{ width: dispW, height: dispH }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); if (!dragRef.current) setEditing(true); }}
        >
          {editing ? (
            <textarea
              ref={taRef}
              className="ctl-ta"
              style={{ fontSize }}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              spellCheck={false}
            />
          ) : (
            <div className="ctl-disp" style={{ fontSize }}>
              {text || <span className="ctl-ph">Type here…</span>}
            </div>
          )}

          {['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map((c) => (
            <div
              key={c}
              className={`ctl-rz ctl-rz-${c}`}
              style={{ cursor: CURSORS[c] }}
              onMouseDown={(e) => beginResize(c, e)}
            />
          ))}
        </div>
      </Draggable>
      {toolbar}
    </>
  );
}
