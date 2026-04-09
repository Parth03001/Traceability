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
  stationData = {},
  description = '',
  position: parentPosition,
  onPositionChange,
  onDelete,
  onPortMouseDown,
  canvasScale,
}) {
  const [pos, setPos] = useState(parentPosition || { x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const nodeRef = useRef(null);
  const updateXarrow = useXarrow();

  useEffect(() => {
    if (parentPosition) setPos(parentPosition);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentPosition?.x, parentPosition?.y]);

  const handleStart = () => setIsDragging(true);

  const handleDrag = (e, data) => {
    setPos({ x: data.x, y: data.y });
    updateXarrow();
  };

  const handleStop = (e, data) => {
    setIsDragging(false);
    if (onPositionChange) onPositionChange(id, { x: data.x, y: data.y });
  };

  // Per-station top dot: fromId = "${boxId}__${stationId}"
  const handleSidPortDown = (e, portId) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    if (onPortMouseDown) onPortMouseDown(portId, rect.left + rect.width / 2, rect.top + rect.height / 2);
  };

  // Box-level dots (left/right): each has its own DOM id so Xarrow terminates at the dot
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
      handle=".station-box-header"
      scale={canvasScale || 1}
      grid={[40, 40]}
    >
      <div
        ref={nodeRef}
        id={id}
        className="station-box"
        style={{
          width: `${Math.max(1, stationIds.length) * 40 + 4}px`,
          minWidth: '80px',
          ...(isDragging ? { zIndex: 1000 } : {}),
        }}
      >
        {/* ── Per-station top port dots — one above each station column ─── */}
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

        {/* ── Per-station bottom port dots — one below each station column ─ */}
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

        {/* ── Box-level port dots: left and right — each has its own id ── */}
        <div id={`${id}__left`}  className="station-box-port station-box-port--left"  onMouseDown={handleBoxPortDown} title="Drag to connect" />
        <div id={`${id}__right`} className="station-box-port station-box-port--right" onMouseDown={handleBoxPortDown} title="Drag to connect" />

        <div className="station-box-header">
          <span className="station-box-title">{name}</span>
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

        <div className="station-box-body">
            <table className="station-grid">
              <thead>
                <tr>
                  {stationIds.map((sid) => (
                    <th key={sid} colSpan={2} className="station-grid-header-cell">{sid}</th>
                  ))}
                </tr>
                {description && (
                  <tr>
                    <td colSpan={stationIds.length * 2} className="station-grid-desc-cell">
                      {description}
                    </td>
                  </tr>
                )}
              </thead>
              <tbody>
                {/* Z row — one cell per station (spans both label+value cols), invisible text */}
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
