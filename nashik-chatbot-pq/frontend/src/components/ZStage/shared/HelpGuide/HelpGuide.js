import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Draggable from 'react-draggable';
import { X, HelpCircle } from 'lucide-react';
import './HelpGuide.css';

const STORAGE_KEY = 'help-fab-pos';

function HelpGuide({ title, sections = [] }) {
  const [open, setOpen] = useState(false);
  const [fabPos, setFabPos] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : { x: 0, y: 0 };
    } catch { return { x: 0, y: 0 }; }
  });

  const panelRef   = useRef(null);
  const fabRef     = useRef(null);
  const didDragRef = useRef(false);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Close panel on click outside
  useEffect(() => {
    if (!open) return;
    const onClick = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    };
    const t = setTimeout(() => document.addEventListener('mousedown', onClick), 50);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', onClick); };
  }, [open]);

  return createPortal(
    <>
      {/* ── Draggable floating "?" button ────────────────────────────────── */}
      <Draggable
        nodeRef={fabRef}
        position={fabPos}
        onStart={() => { didDragRef.current = false; }}
        onDrag={(e, data) => {
          didDragRef.current = true;
          setFabPos({ x: data.x, y: data.y });
        }}
        onStop={(e, data) => {
          if (didDragRef.current) {
            const pos = { x: data.x, y: data.y };
            setFabPos(pos);
            try { localStorage.setItem(STORAGE_KEY, JSON.stringify(pos)); } catch {}
          }
        }}
      >
        <button
          ref={fabRef}
          className={`help-fab${open ? ' help-fab--active' : ''}`}
          onClick={() => { if (!didDragRef.current) setOpen((v) => !v); }}
          title="Help / Guide — drag to reposition"
          aria-label="Open help guide"
        >
          <HelpCircle size={20} />
        </button>
      </Draggable>

      {/* Backdrop */}
      {open && <div className="help-backdrop" />}

      {/* Slide-in panel */}
      <div ref={panelRef} className={`help-panel${open ? ' help-panel--open' : ''}`}>
        <div className="help-panel-header">
          <div className="help-panel-title">
            <HelpCircle size={18} className="help-panel-title-icon" />
            <span>{title || 'Page Guide'}</span>
          </div>
          <button className="help-panel-close" onClick={() => setOpen(false)} title="Close">
            <X size={16} />
          </button>
        </div>

        <div className="help-panel-body">
          {sections.map((sec, si) => (
            <div key={si} className="help-section">
              {sec.heading && (
                <div className="help-section-heading">{sec.heading}</div>
              )}
              <ul className="help-item-list">
                {sec.items.map((item, ii) => (
                  <li key={ii} className="help-item">
                    {item.icon && (
                      <span className="help-item-icon">{item.icon}</span>
                    )}
                    <div className="help-item-text">
                      {item.label && (
                        <span className="help-item-label">{item.label}</span>
                      )}
                      <span className="help-item-desc">{item.desc}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </>,
    document.body
  );
}

export default HelpGuide;
