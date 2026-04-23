import React, { useState, useRef, useEffect } from 'react';
import Draggable from 'react-draggable';
import { useXarrow } from 'react-xarrows';
import { GitBranch, X, Trash2 } from 'lucide-react';
import './BypassIcon.css';

function BuyoffIcon({ id, position: parentPosition, onPositionChange, onDelete, onPortMouseDown, canvasScale }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [pos, setPos] = useState(parentPosition || { x: 0, y: 0 });
  const nodeRef = useRef(null);
  const updateXarrow = useXarrow();

  useEffect(() => {
    if (parentPosition) setPos(parentPosition);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentPosition?.x, parentPosition?.y]);

  const handleDrag = (e, data) => {
    setPos({ x: data.x, y: data.y });
    updateXarrow();
  };

  const handleDragStop = (e, data) => {
    if (onPositionChange) onPositionChange(id, { x: data.x, y: data.y });
  };

  const toggleExpand = (e) => {
    e.stopPropagation();
    setIsExpanded((prev) => !prev);
  };

  const handlePortDown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const portId = e.currentTarget.id;
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    if (onPortMouseDown) onPortMouseDown(portId, cx, cy);
  };

  return (
    <Draggable
      nodeRef={nodeRef}
      position={pos}
      onDrag={handleDrag}
      onStop={handleDragStop}
      handle=".buyoff-drag-handle"
      scale={canvasScale || 1}
      grid={[40, 40]}
    >
      <div ref={nodeRef} id={id} className="buyoff-icon-wrapper">
        <div className="buyoff-drag-handle buyoff-diamond" onClick={toggleExpand} title="Buyoff / Connect">
          <span className="buyoff-diamond-inner"><GitBranch size={14} /></span>
        </div>

        {/* Connection ports — visible on hover, each has a direction-encoded id */}
        <button id={`${id}__right`}  className="buyoff-port buyoff-port--right"  onMouseDown={handlePortDown} title="Drag to connect" />
        <button id={`${id}__left`}   className="buyoff-port buyoff-port--left"   onMouseDown={handlePortDown} title="Drag to connect" />
        <button id={`${id}__top`}    className="buyoff-port buyoff-port--top"    onMouseDown={handlePortDown} title="Drag to connect" />
        <button id={`${id}__bottom`} className="buyoff-port buyoff-port--bottom" onMouseDown={handlePortDown} title="Drag to connect" />

        {isExpanded && (
          <div className="buyoff-accordion">
            <div className="buyoff-accordion-header">
              <span>Buyoff Connection</span>
              <button className="buyoff-close-btn" onClick={toggleExpand}><X size={12} /></button>
            </div>
            <div className="buyoff-accordion-body">
              <div className="buyoff-connection-row">
                <span className="buyoff-dot buyoff-dot--in"></span>
                <span className="buyoff-connection-label">In</span>
              </div>
              <div className="buyoff-connection-row">
                <span className="buyoff-dot buyoff-dot--out"></span>
                <span className="buyoff-connection-label">Out</span>
              </div>
              <div className="buyoff-connection-row">
                <span className="buyoff-dot buyoff-dot--buyoff"></span>
                <span className="buyoff-connection-label">Buyoff</span>
              </div>
            </div>
            {onDelete && (
              <button className="buyoff-delete-btn" onClick={() => onDelete(id)}>
                <Trash2 size={12} />
                Remove
              </button>
            )}
          </div>
        )}
      </div>
    </Draggable>
  );
}

export default BuyoffIcon;
