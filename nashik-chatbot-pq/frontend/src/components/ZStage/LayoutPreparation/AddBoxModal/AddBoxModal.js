import React, { useState, useMemo } from 'react';
import { X } from 'lucide-react';
import './AddBoxModal.css';

function buildAutoIds(prefix, count, reversed) {
  const p = prefix.trim().toUpperCase();
  const ids = Array.from({ length: count }, (_, i) => `${p}-${String(i + 1).padStart(2, '0')}`);
  return reversed ? ids.slice().reverse() : ids;
}

function buildRangeIds(prefix, start, end, reversed) {
  const p = prefix.trim().toUpperCase();
  const s = Number(start);
  const e = Number(end);
  const padLen = Math.max(2, String(e).length);
  const ids = Array.from({ length: e - s + 1 }, (_, i) => `${p}-${String(s + i).padStart(padLen, '0')}`);
  return reversed ? ids.slice().reverse() : ids;
}

const DEFAULT_FORM = {
  name: '', prefix: '', stationCount: 5,
  rangeStart: '', rangeEnd: '',
  description: '', stationNames: '',
};

function AddBoxModal({ onAdd, onClose }) {
  const [form, setForm] = useState(DEFAULT_FORM);
  const [mode, setMode] = useState('auto'); // 'auto' | 'range' | 'custom'
  const [reversed, setReversed] = useState(false);
  const [customText, setCustomText] = useState('');
  const [errors, setErrors] = useState({});

  const autoIds = useMemo(() => {
    if (!form.prefix.trim() || form.stationCount < 1) return [];
    return buildAutoIds(form.prefix, Number(form.stationCount), reversed);
  }, [form.prefix, form.stationCount, reversed]);

  const rangeIds = useMemo(() => {
    if (!form.prefix.trim()) return [];
    const s = parseInt(form.rangeStart, 10);
    const e = parseInt(form.rangeEnd, 10);
    if (isNaN(s) || isNaN(e) || s > e || e - s + 1 > 60) return [];
    return buildRangeIds(form.prefix, s, e, reversed);
  }, [form.prefix, form.rangeStart, form.rangeEnd, reversed]);

  const handleModeSwitch = (newMode) => {
    if (newMode === 'custom') {
      const src = mode === 'auto' ? autoIds : mode === 'range' ? rangeIds : [];
      if (src.length) setCustomText(src.join('\n'));
    }
    setMode(newMode);
    setErrors({});
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: name === 'stationCount' ? parseInt(value, 10) || '' : value,
    }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const parsedCustomIds = useMemo(
    () =>
      customText
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    [customText],
  );

  const previewIds = mode === 'auto' ? autoIds : mode === 'range' ? rangeIds : parsedCustomIds;

  const validate = () => {
    const errs = {};
    if (!form.name.trim()) errs.name = 'Station / line name is required';
    if (mode === 'auto') {
      if (!form.prefix.trim()) errs.prefix = 'Prefix is required';
      if (!form.stationCount || form.stationCount < 1) errs.stationCount = 'At least 1 station required';
      if (form.stationCount > 60) errs.stationCount = 'Maximum 60 stations';
    } else if (mode === 'range') {
      if (!form.prefix.trim()) errs.prefix = 'Prefix is required';
      const s = parseInt(form.rangeStart, 10);
      const e = parseInt(form.rangeEnd, 10);
      if (isNaN(s) || form.rangeStart === '') errs.rangeStart = 'Enter start number';
      else if (isNaN(e) || form.rangeEnd === '') errs.rangeEnd = 'Enter end number';
      else if (s > e) errs.rangeEnd = 'End must be ≥ start';
      else if (e - s + 1 > 60) errs.rangeEnd = 'Maximum 60 stations — reduce the range';
    } else {
      if (parsedCustomIds.length === 0) errs.customIds = 'Enter at least one station ID';
      if (parsedCustomIds.length > 60) errs.customIds = 'Maximum 60 stations';
    }
    return errs;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }

    const stationIds = mode === 'auto' ? autoIds : mode === 'range' ? rangeIds : parsedCustomIds;

    // Parse station names: split by comma, preserve empty positions, trim each entry
    const rawNames = form.stationNames.split(',').map((s) => s.trim());
    // Drop trailing empty strings
    while (rawNames.length > 0 && rawNames[rawNames.length - 1] === '') rawNames.pop();
    const stationNames = rawNames.length > 0 ? rawNames : [];

    onAdd({
      name: form.name.trim(),
      stationIds,
      stationNames,
      description: form.description.trim(),
    });
    onClose();
  };

  const ReverseToggle = () => (
    <div className="modal-field modal-field--inline">
      <label className="modal-label">Reverse Order</label>
      <button
        type="button"
        className={`modal-toggle-btn${reversed ? ' modal-toggle-btn--on' : ''}`}
        onClick={() => setReversed((v) => !v)}
        title="Generate station IDs from highest to lowest"
      >
        {reversed ? 'ON' : 'OFF'}
      </button>
      <span className="modal-label-hint">
        {reversed ? ' — descending' : ' — ascending'}
      </span>
    </div>
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Add Station Box</h2>
          <button className="modal-close-btn" onClick={onClose}><X size={14} /></button>
        </div>

        <form className="modal-form" onSubmit={handleSubmit}>
          {/* Name */}
          <div className="modal-field">
            <label className="modal-label">Station / Line Name</label>
            <input
              className={`modal-input${errors.name ? ' modal-input--error' : ''}`}
              type="text"
              name="name"
              value={form.name}
              onChange={handleFormChange}
              placeholder="e.g. TRIM 1"
              autoFocus
            />
            {errors.name && <span className="modal-error">{errors.name}</span>}
          </div>

          {/* Mode toggle — 3 tabs */}
          <div className="modal-mode-toggle">
            <button
              type="button"
              className={`modal-mode-btn${mode === 'auto' ? ' modal-mode-btn--active' : ''}`}
              onClick={() => handleModeSwitch('auto')}
            >
              Auto IDs
            </button>
            <button
              type="button"
              className={`modal-mode-btn${mode === 'range' ? ' modal-mode-btn--active' : ''}`}
              onClick={() => handleModeSwitch('range')}
            >
              Range IDs
            </button>
            <button
              type="button"
              className={`modal-mode-btn${mode === 'custom' ? ' modal-mode-btn--active' : ''}`}
              onClick={() => handleModeSwitch('custom')}
            >
              Custom IDs
            </button>
          </div>

          {/* ── Auto mode ────────────────────────────────────────────────── */}
          {mode === 'auto' && (
            <>
              <div className="modal-field">
                <label className="modal-label">Station ID Prefix</label>
                <input
                  className={`modal-input${errors.prefix ? ' modal-input--error' : ''}`}
                  type="text"
                  name="prefix"
                  value={form.prefix}
                  onChange={handleFormChange}
                  placeholder="e.g. T1  →  T1-01, T1-02 …"
                  maxLength={10}
                />
                {errors.prefix && <span className="modal-error">{errors.prefix}</span>}
              </div>

              <div className="modal-field">
                <label className="modal-label">Number of Stations</label>
                <input
                  className={`modal-input${errors.stationCount ? ' modal-input--error' : ''}`}
                  type="number"
                  name="stationCount"
                  value={form.stationCount}
                  onChange={handleFormChange}
                  min={1}
                  max={60}
                />
                {errors.stationCount && <span className="modal-error">{errors.stationCount}</span>}
              </div>

              <ReverseToggle />
            </>
          )}

          {/* ── Range mode ────────────────────────────────────────────────── */}
          {mode === 'range' && (
            <>
              <div className="modal-field">
                <label className="modal-label">Station ID Prefix</label>
                <input
                  className={`modal-input${errors.prefix ? ' modal-input--error' : ''}`}
                  type="text"
                  name="prefix"
                  value={form.prefix}
                  onChange={handleFormChange}
                  placeholder="e.g. T1  →  T1-30, T1-31 …"
                  maxLength={10}
                />
                {errors.prefix && <span className="modal-error">{errors.prefix}</span>}
              </div>

              <div className="modal-field">
                <label className="modal-label">
                  Station ID Range
                  <span className="modal-label-hint"> — start to end, max 60 stations</span>
                </label>
                <div className="modal-range-row">
                  <input
                    className={`modal-input modal-range-input${errors.rangeStart ? ' modal-input--error' : ''}`}
                    type="number"
                    name="rangeStart"
                    value={form.rangeStart}
                    onChange={handleFormChange}
                    placeholder="From"
                    min={0}
                  />
                  <span className="modal-range-sep">–</span>
                  <input
                    className={`modal-input modal-range-input${errors.rangeEnd ? ' modal-input--error' : ''}`}
                    type="number"
                    name="rangeEnd"
                    value={form.rangeEnd}
                    onChange={handleFormChange}
                    placeholder="To"
                    min={0}
                  />
                </div>
                {(errors.rangeStart || errors.rangeEnd) && (
                  <span className="modal-error">{errors.rangeStart || errors.rangeEnd}</span>
                )}
                {rangeIds.length > 0 && (
                  <span className="modal-hint">{rangeIds.length} stations will be created</span>
                )}
              </div>

              <ReverseToggle />
            </>
          )}

          {/* ── Custom mode ───────────────────────────────────────────────── */}
          {mode === 'custom' && (
            <div className="modal-field">
              <label className="modal-label">
                Station IDs
                <span className="modal-label-hint"> — one per line or comma-separated</span>
              </label>
              <textarea
                className={`modal-textarea${errors.customIds ? ' modal-input--error' : ''}`}
                value={customText}
                onChange={(e) => {
                  setCustomText(e.target.value);
                  if (errors.customIds) setErrors((p) => ({ ...p, customIds: undefined }));
                }}
                placeholder={"T1-01\nT1-02\nT1-03\n…  or  T1-01, T1-02, T1-03"}
                rows={6}
                spellCheck={false}
              />
              {errors.customIds && <span className="modal-error">{errors.customIds}</span>}
            </div>
          )}

          {/* ── Station Names ─────────────────────────────────────────────── */}
          <div className="modal-field">
            <label className="modal-label">
              Station Names
              <span className="modal-label-hint"> — comma-separated, one per station (optional)</span>
            </label>
            <input
              className="modal-input"
              type="text"
              name="stationNames"
              value={form.stationNames}
              onChange={handleFormChange}
              placeholder="e.g. Body, Paint, Trim,, Final"
            />
            <span className="modal-hint">Empty slots (,,) leave the station unnamed. Editable on canvas.</span>
          </div>

          {/* ── Description ───────────────────────────────────────────────── */}
          <div className="modal-field">
            <label className="modal-label">
              Description
              <span className="modal-label-hint"> — optional, shown below station names</span>
            </label>
            <input
              className="modal-input"
              type="text"
              name="description"
              value={form.description}
              onChange={handleFormChange}
              placeholder="e.g. Trim Line A"
              maxLength={60}
            />
          </div>

          {/* ID preview chips */}
          {previewIds.length > 0 && (
            <div className="modal-id-preview">
              <span className="modal-id-preview-label">{previewIds.length} station{previewIds.length !== 1 ? 's' : ''}:</span>
              <div className="modal-id-chips">
                {previewIds.slice(0, 20).map((id) => (
                  <span key={id} className="modal-id-chip">{id}</span>
                ))}
                {previewIds.length > 20 && (
                  <span className="modal-id-chip modal-id-chip--more">+{previewIds.length - 20} more</span>
                )}
              </div>
            </div>
          )}

          <div className="modal-actions">
            <button type="button" className="modal-btn modal-btn--cancel" onClick={onClose}>Cancel</button>
            <button type="submit" className="modal-btn modal-btn--add">Add Box</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AddBoxModal;
