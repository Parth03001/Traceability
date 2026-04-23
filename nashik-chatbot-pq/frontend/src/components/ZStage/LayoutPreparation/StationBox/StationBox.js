import React, { useRef, useEffect, useState } from 'react';
import Draggable from 'react-draggable';
import { useXarrow } from 'react-xarrows';
import { X } from 'lucide-react';
import './StationBox.css';

// Each station column is 40px wide; box has a 2px border (box-sizing: border-box).
// Dot center for station i: border(2) + i*40 + 20 = 22 + i*40 px from left edge.
// Dot is 10px wide, so left edge offset: 22 + i*40 - 5 = 17 + i*40
const SID_DOT_LEFT = (i) => 17 + i * 40;

function StationBox({
  id,
  name,
  stationIds,
  stationNames = [],
  stationData = {},
  description = '',
  position: parentPosition,
  onPositionChange,
  onDelete,
  onPortMouseDown,
  onNameChange,
  onDescriptionChange,
  onStationNamesChange,
  onStationIdChange,
  onSelect,
  isSelected = false,
  canvasScale,
}) {
  const [pos, setPos] = useState(parentPosition || { x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragMovedRef = useRef(false);

  // Box title editing
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(name);

  // Box description editing
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState(description);

  // Station name cell editing (per-station)
  const [editingSnameIdx, setEditingSnameIdx] = useState(null);
  const [snameDraft, setSnameDraft] = useState('');

  // Station ID header editing (per-station)
  const [editingSidIdx, setEditingSidIdx] = useState(null);
  const [sidDraft, setSidDraft] = useState('');

  const nodeRef      = useRef(null);
  const nameInputRef = useRef(null);
  const descInputRef = useRef(null);
  const snameInputRef = useRef(null);
  const sidInputRef   = useRef(null);
  const updateXarrow = useXarrow();

  useEffect(() => {
    if (parentPosition) setPos(parentPosition);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentPosition?.x, parentPosition?.y]);

  useEffect(() => { setNameDraft(name); }, [name]);
  useEffect(() => { setDescDraft(description); }, [description]);

  useEffect(() => {
    if (editingName && nameInputRef.current) nameInputRef.current.focus();
  }, [editingName]);

  useEffect(() => {
    if (editingDesc && descInputRef.current) descInputRef.current.focus();
  }, [editingDesc]);

  useEffect(() => {
    if (editingSnameIdx !== null && snameInputRef.current) snameInputRef.current.focus();
  }, [editingSnameIdx]);

  useEffect(() => {
    if (editingSidIdx !== null && sidInputRef.current) sidInputRef.current.focus();
  }, [editingSidIdx]);

  // ── Commit handlers ──────────────────────────────────────────────────────────

  const commitName = () => {
    setEditingName(false);
    const trimmed = nameDraft.trim();
    if (!trimmed) { setNameDraft(name); return; }
    if (trimmed !== name && onNameChange) onNameChange(id, trimmed);
  };

  const commitDesc = () => {
    setEditingDesc(false);
    const trimmed = descDraft.trim();
    if (trimmed !== description && onDescriptionChange) onDescriptionChange(id, trimmed);
  };

  const commitSname = () => {
    const idx = editingSnameIdx;
    setEditingSnameIdx(null);
    if (idx === null || !onStationNamesChange) return;
    const current = Array.isArray(stationNames) ? [...stationNames] : [];
    while (current.length <= idx) current.push('');
    current[idx] = snameDraft.trim();
    onStationNamesChange(id, current);
  };

  const commitSid = () => {
    const idx = editingSidIdx;
    setEditingSidIdx(null);
    const trimmed = sidDraft.trim();
    if (idx === null || !trimmed || trimmed === stationIds[idx]) return;
    if (onStationIdChange) onStationIdChange(id, idx, trimmed);
  };

  // ── Drag handlers ────────────────────────────────────────────────────────────

  const handleStart = () => {
    setIsDragging(true);
    dragMovedRef.current = false;
  };

  const handleDrag = (e, data) => {
    dragMovedRef.current = true;
    setPos({ x: data.x, y: data.y });
    updateXarrow();
  };

  const handleStop = (e, data) => {
    setIsDragging(false);
    if (dragMovedRef.current) {
      if (onPositionChange) onPositionChange(id, { x: data.x, y: data.y });
    } else {
      if (onSelect && !editingName && !editingDesc && editingSnameIdx === null && editingSidIdx === null) {
        onSelect(id, e.ctrlKey || e.metaKey);
      }
    }
  };

  // ── Port handlers ────────────────────────────────────────────────────────────

  const handleSidPortDown = (e, portId) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    if (onPortMouseDown) onPortMouseDown(portId, rect.left + rect.width / 2, rect.top + rect.height / 2);
  };

  const handleBoxPortDown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const portId = e.currentTarget.id;
    const rect = e.currentTarget.getBoundingClientRect();
    if (onPortMouseDown) onPortMouseDown(portId, rect.left + rect.width / 2, rect.top + rect.height / 2);
  };

  return (
    <Draggable
      nodeRef={nodeRef}
      position={pos}
      onStart={handleStart}
      onDrag={handleDrag}
      onStop={handleStop}
      handle=".station-box-drag-handle"
      disabled={editingName || editingSnameIdx !== null || editingSidIdx !== null}
      scale={canvasScale || 1}
      grid={[40, 40]}
    >
      <div
        ref={nodeRef}
        id={id}
        className={`station-box${isSelected ? ' station-box--selected' : ''}`}
        style={{
          width: `${Math.max(2, stationIds.length) * 40 + 4}px`,
          ...(isDragging ? { zIndex: 1000 } : isSelected ? { zIndex: 10 } : {}),
        }}
      >
        {/* ── Per-station top port dots ─────────────────────────────────── */}
        {stationIds.map((sid, i) => {
          const portId = `${id}__${sid}`;
          return (
            <div
              key={portId}
              id={portId}
              className="station-sid-port station-sid-port--top"
              style={{ left: SID_DOT_LEFT(i) }}
              onMouseDown={(e) => handleSidPortDown(e, portId)}
              title={`Connect from ${sid}`}
            />
          );
        })}

        {/* ── Per-station bottom port dots ──────────────────────────────── */}
        {stationIds.map((sid, i) => {
          const portId = `${id}__${sid}__b`;
          return (
            <div
              key={portId}
              id={portId}
              className="station-sid-port station-sid-port--bottom"
              style={{ left: SID_DOT_LEFT(i) }}
              onMouseDown={(e) => handleSidPortDown(e, portId)}
              title={`Connect from ${sid}`}
            />
          );
        })}

        {/* ── Box-level left/right port dots ───────────────────────────── */}
        <div id={`${id}__left`}  className="station-box-port station-box-port--left"  onMouseDown={handleBoxPortDown} title="Drag to connect" />
        <div id={`${id}__right`} className="station-box-port station-box-port--right" onMouseDown={handleBoxPortDown} title="Drag to connect" />

        {/* ── Header: drag handle + editable title ─────────────────────── */}
        <div className="station-box-header">
          <div className="station-box-drag-handle station-box-drag-handle--fill" />

          {editingName ? (
            <input
              ref={nameInputRef}
              className="station-box-title-input"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitName();
                if (e.key === 'Escape') { setNameDraft(name); setEditingName(false); }
              }}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            />
          ) : (
            <span
              className="station-box-title"
              title="Double-click to edit"
              onDoubleClick={(e) => { e.stopPropagation(); setEditingName(true); }}
            >
              {name}
            </span>
          )}

          <div className="station-box-controls">
            {onDelete && (
              <button
                className="station-box-ctrl-btn station-box-ctrl-btn--delete"
                title="Delete"
                onClick={(e) => { e.stopPropagation(); onDelete(id); }}
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* ── Table ────────────────────────────────────────────────────── */}
        <div className="station-box-body">
          <table className="station-grid">
            <thead>
              {/* Row 1: Station IDs — double-click to edit */}
              <tr>
                {stationIds.map((sid, i) => {
                  if (editingSidIdx === i) {
                    return (
                      <th key={`sid-${i}`} colSpan={2} className="station-grid-header-cell station-grid-header-cell--editing">
                        <input
                          ref={sidInputRef}
                          className="station-box-sid-input"
                          value={sidDraft}
                          onChange={(e) => setSidDraft(e.target.value)}
                          onBlur={commitSid}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitSid();
                            if (e.key === 'Escape') setEditingSidIdx(null);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                        />
                      </th>
                    );
                  }
                  return (
                    <th
                      key={`sid-${i}`}
                      colSpan={2}
                      className="station-grid-header-cell"
                      title={`${sid} — double-click to edit`}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        setSidDraft(sid);
                        setEditingSidIdx(i);
                      }}
                      onMouseDown={(e) => { if (e.detail >= 2) e.stopPropagation(); }}
                    >
                      {sid}
                    </th>
                  );
                })}
              </tr>

              {/* Row 2: Station names — click to edit, truncated with tooltip */}
              <tr>
                {stationIds.map((sid, i) => {
                  const sname = (Array.isArray(stationNames) && stationNames[i]) || '';
                  if (editingSnameIdx === i) {
                    return (
                      <td key={`sname-${i}`} colSpan={2} className="station-grid-sname-cell station-grid-sname-cell--editing">
                        <input
                          ref={snameInputRef}
                          className="station-box-sname-input"
                          value={snameDraft}
                          placeholder="Name…"
                          onChange={(e) => setSnameDraft(e.target.value)}
                          onBlur={commitSname}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitSname();
                            if (e.key === 'Escape') setEditingSnameIdx(null);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                        />
                      </td>
                    );
                  }
                  return (
                    <td
                      key={`sname-${i}`}
                      colSpan={2}
                      className={`station-grid-sname-cell${!sname ? ' station-grid-sname-cell--empty' : ''}`}
                      title={sname ? `${sname} — double-click to edit` : 'Station name — double-click to add'}
                      onMouseDown={(e) => { if (e.detail >= 2) e.stopPropagation(); }}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        setSnameDraft(sname);
                        setEditingSnameIdx(i);
                      }}
                    >
                      {sname
                        ? <span className="station-grid-sname-text">{sname}</span>
                        : <span className="station-sname-placeholder">+</span>
                      }
                    </td>
                  );
                })}
              </tr>

              {/* Row 3: Description — spans all columns */}
              <tr>
                {editingDesc ? (
                  <td colSpan={stationIds.length * 2} className="station-grid-desc-cell station-grid-desc-cell--editing">
                    <input
                      ref={descInputRef}
                      className="station-box-desc-input"
                      value={descDraft}
                      placeholder="Add description…"
                      maxLength={80}
                      onChange={(e) => setDescDraft(e.target.value)}
                      onBlur={commitDesc}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitDesc();
                        if (e.key === 'Escape') { setDescDraft(description); setEditingDesc(false); }
                      }}
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                    />
                  </td>
                ) : (
                  <td
                    colSpan={stationIds.length * 2}
                    className={`station-grid-desc-cell station-grid-desc-cell--editable${!description ? ' station-grid-desc-cell--empty' : ''}`}
                    title={description ? `${description} — click to edit` : 'Description — click to add'}
                    onClick={(e) => { e.stopPropagation(); setEditingDesc(true); }}
                  >
                    {description || <span className="station-desc-placeholder">+ add description</span>}
                  </td>
                )}
              </tr>
            </thead>
            <tbody>
              {/* Z row */}
              <tr>
                {stationIds.map((sid) => (
                  <td key={sid} colSpan={2} className="station-grid-label--z">Z</td>
                ))}
              </tr>
              {['M', 'P', 'D', 'U'].map((label) => (
                <tr key={label}>
                  {stationIds.map((sid) => (
                    <React.Fragment key={sid}>
                      <td className="station-grid-label">{label}</td>
                      <td className="station-grid-value">
                        {stationData[sid]?.[label] || ''}
                      </td>
                    </React.Fragment>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Draggable>
  );
}

export default StationBox;
