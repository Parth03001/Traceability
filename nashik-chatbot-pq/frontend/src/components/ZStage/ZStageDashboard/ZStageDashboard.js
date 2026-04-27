import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Xwrapper } from 'react-xarrows';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { ZoomIn, ZoomOut, Maximize2, RefreshCw, GitBranch, X, Loader, TableProperties, Upload, FileText, Trash2, Plus, AlertCircle, CheckCircle } from 'lucide-react';
import { layoutApi, inputApi, layeredAuditApi, docApi } from '../../../services/api/layoutApi';
import { getPortCanvasPos, buildObstacles, routePath } from '../shared/routeArrow';
import HelpGuide from '../shared/HelpGuide/HelpGuide';
import './ZStageDashboard.css';

const DASHBOARD_HELP = {
  title: 'Z Stage Dashboard — Guide',
  sections: [
    {
      heading: 'Canvas Overview',
      items: [
        { icon: '🗺️', label: 'Canvas View',       desc: 'Read-only view of your saved layout. Station boxes are overlaid with live concern data from Master Data records.' },
        { icon: '🟥', label: 'Red Header',         desc: 'A station header turns red when it has at least one active concern (Status 3M = R with total incidences > 0). E classification has priority over Z.' },
        { icon: '🟩', label: 'Green Header',        desc: 'Station header is green when Z/E records exist for the station but all are resolved (no active incidences).' },
        { icon: '🔵', label: 'Station Names Row',   desc: 'The blue row shows the station names defined in the Layout editor below each station ID.' },
        { icon: '💎', label: 'Buyoff / Bypass',     desc: 'Diamond-shaped icons on the canvas represent buyoff or bypass points defined in the layout.' },
        { icon: '➡️', label: 'Connection Arrows',   desc: 'Arrows between boxes show the flow connections drawn in the Layout editor.' },
        { icon: '🔤', label: 'Text Labels',          desc: 'Free-text annotations placed in the Layout editor appear here as read-only overlays with a dashed border.' },
        { icon: '⬛', label: 'Canvas Arrows',        desc: 'Broad directional arrows placed in the Layout editor appear here as read-only green arrow shapes.' },
      ],
    },
    {
      heading: 'Navigation',
      items: [
        { icon: '🖱️', label: 'Pan',               desc: 'Click and drag on any empty canvas area to pan around the layout.' },
        { icon: '🔍', label: 'Zoom',              desc: 'Use the scroll wheel to zoom, or use the +  /  −  /  ⊡ zoom buttons in the bottom-right corner of the canvas.' },
        { icon: '⊡',  label: 'Reset View',        desc: 'Click the square icon (bottom-right zoom controls) to reset zoom and re-center the view.' },
        { icon: '↻',  label: 'Refresh',           desc: 'Click the Refresh button (top toolbar) to reload the latest records and update all station colours.' },
      ],
    },
    {
      heading: 'Station Detail Popup',
      items: [
        { icon: '👆', label: 'Open Popup',         desc: 'Click any station ID header (the green or red cell) to open a detail panel for that station.' },
        { icon: '🗄️', label: 'Master Data tab',    desc: 'View and inline-edit all concern records for this station. Click any cell to edit; changes save automatically.' },
        { icon: '📋', label: 'Layered Audit tab',  desc: 'View layered audit observations linked to this station.' },
        { icon: '📅', label: 'Audit Adherence tab',desc: 'View audit adherence records for this station.' },
        { icon: '📎', label: 'Docs tab',           desc: 'Upload and download documents attached to each concern. Documents are grouped by concern and document type.' },
        { icon: '➕', label: 'Add Record',          desc: 'Click "Add Record" in any data tab to add a new row directly linked to this station.' },
      ],
    },
    {
      heading: 'Data Inside Each Station Box',
      items: [
        { icon: '⚡', label: 'Z / E symbol',       desc: 'Shows whether the station has Z or E classification concerns. E takes priority over Z. Colour (red/green) reflects active issue status.' },
        { icon: '🔤', label: 'P / M / D / U rows', desc: 'Shows "X/Y" per attribution — X = number of records with active incidences, Y = total incidence count. Only status_3m = R records are counted.' },
      ],
    },
    {
      heading: 'Legend Box (on canvas)',
      items: [
        { icon: '📊', label: 'Summary Table',      desc: 'A draggable box on the canvas showing totals by TYPE (WH/USV) and ATTRIBUTION (Parts/Design/Process/U/A) — Phenomenons, Incidences, Stages, Red count, and Effectiveness %.' },
        { icon: '✋', label: 'Drag to Move',        desc: 'Click and drag the legend box to reposition it anywhere on the canvas.' },
      ],
    },
    {
      heading: 'Toolbar',
      items: [
        { icon: '🎨', label: 'Colour Legend',      desc: 'The top bar shows colour chips: red Z = active issues, green Z = no issues, M/P/D/U chips = attribution colour codes.' },
        { icon: '📂', label: 'Layout Dropdown',    desc: 'Switch between saved layouts using the "Layout:" dropdown in the top-right toolbar. The dashboard automatically selects whichever layout is currently open in the Layout editor.' },
        { icon: '↻',  label: 'Refresh',            desc: 'Reloads all records and recalculates station colours with the latest data. The dashboard also auto-refreshes whenever the Layout editor saves a change.' },
      ],
    },
  ],
};

// ── Constants (mirror LayoutPreparation) ──────────────────────────────────────
const GRID = 40;
const CANVAS_SIZE = 5000;

const boxWidth = (stationCount) => Math.max(2, stationCount) * 40 + 4;

// ── Column definitions (mirror InputData) ─────────────────────────────────────
const MONTHLY_KEYS = [
  '2024-01','2024-02','2024-03','2024-04','2024-05','2024-06',
  '2024-07','2024-08','2024-09','2024-10','2024-11','2024-12',
  '2025-01','2025-02','2025-03','2025-04','2025-05','2025-06',
  '2025-07','2025-08','2025-09','2025-10','2025-11','2025-12',
  '2026-01','2026-02','2026-03',
];

const FIXED_COLS = [
  { key: 'sr_no',           label: 'Sr.No',          width: 60,  type: 'number' },
  { key: 'concern_id',      label: 'Concern ID',      width: 130, type: 'text'   },
  { key: 'concern',         label: 'Concern',         width: 260, type: 'text'   },
  { key: 'type',            label: 'Type',            width: 70,  type: 'text'   },
  { key: 'root_cause',      label: 'Root Cause',      width: 220, type: 'text'   },
  { key: 'action_plan',     label: 'Action Plan',     width: 220, type: 'text'   },
  { key: 'target_date',     label: 'Target Date',     width: 110, type: 'text'   },
  { key: 'closure_date',    label: 'Closure Date',    width: 110, type: 'text'   },
  { key: 'ryg',             label: 'RYG',             width: 60,  type: 'text'   },
  { key: 'attri',           label: 'Attri.',          width: 90,  type: 'text'   },
  { key: 'comm',            label: 'Commodity',       width: 160, type: 'text'   },
  { key: 'line',            label: 'Line',            width: 120, type: 'text'   },
  { key: 'stage_no',        label: 'Stage No',        width: 90,  type: 'text'   },
  { key: 'z_e',             label: 'Z/E',             width: 55,  type: 'text'   },
  { key: 'attribution',     label: 'Attribution',     width: 90,  type: 'text'   },
  { key: 'part',            label: 'Part',            width: 160, type: 'text'   },
  { key: 'phenomena',       label: 'Phenomena',       width: 160, type: 'text'   },
  { key: 'total_incidences', label: 'Total',          width: 70,  type: 'number' },
];

const TRAILING_COLS = [
  { key: 'field_defect_after_cutoff', label: 'Field Defect After Cut-off', width: 130, type: 'number' },
  { key: 'status_3m',                 label: 'Status (3M)',                 width: 90,  type: 'text'   },
];

const LONG_TEXT = new Set(['concern', 'root_cause', 'action_plan', 'comm']);

function fmtMonth(key) {
  const [year, month] = key.split('-');
  return new Date(Number(year), Number(month) - 1, 1)
    .toLocaleString('default', { month: 'short' }) + ' ' + year.slice(2);
}

// ── Inline editable cell ───────────────────────────────────────────────────────
function EditableCell({ recordId, fieldKey, value, type, onSaved, stickyLeft }) {
  const stickyStyle = stickyLeft !== undefined
    ? { position: 'sticky', left: stickyLeft, zIndex: 1, backgroundColor: 'inherit' }
    : {};
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState(value ?? '');
  const [saving, setSaving]   = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { setDraft(value ?? ''); }, [value]);
  useEffect(() => { if (editing && inputRef.current) inputRef.current.focus(); }, [editing]);

  const commit = useCallback(async () => {
    setEditing(false);
    const trimmed  = draft.trim();
    const original = String(value ?? '');
    if (trimmed === original) return;
    setSaving(true);
    try {
      const payload = {
        [fieldKey]: type === 'number'
          ? (trimmed === '' ? null : Number(trimmed))
          : (trimmed || null),
      };
      const res = await inputApi.updateRecord(recordId, payload);
      onSaved(recordId, res.data);
    } catch {
      setDraft(value ?? '');
    } finally {
      setSaving(false);
    }
  }, [draft, value, fieldKey, type, recordId, onSaved]);

  const onKeyDown = (e) => {
    if (e.key === 'Enter')  commit();
    if (e.key === 'Escape') { setDraft(value ?? ''); setEditing(false); }
  };

  if (saving) return <td className="sdm-cell-saving" style={stickyStyle}><Loader size={12} className="sdm-spin" /></td>;

  if (editing) {
    return (
      <td className="sdm-cell-editing" style={stickyStyle}>
        {LONG_TEXT.has(fieldKey) ? (
          <textarea
            ref={inputRef} value={draft} rows={3}
            className="sdm-cell-textarea"
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === 'Escape') { setDraft(value ?? ''); setEditing(false); } }}
          />
        ) : (
          <input
            ref={inputRef} value={draft}
            type={type === 'number' ? 'number' : 'text'}
            className="sdm-cell-input"
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={onKeyDown}
          />
        )}
      </td>
    );
  }

  const display = value ?? '';
  return (
    <td className="sdm-cell-view" style={stickyStyle} onClick={() => setEditing(true)} title="Click to edit">
      {display === '' || display === null
        ? <span className="sdm-cell-empty">—</span>
        : <span>{String(display)}</span>}
    </td>
  );
}

// ── Inline editable monthly cell ──────────────────────────────────────────────
function MonthlyCell({ recordId, monthKey, monthlyData, onSaved }) {
  const parsed = React.useMemo(() => {
    try { return JSON.parse(monthlyData || '{}'); } catch { return {}; }
  }, [monthlyData]);
  const value = parsed[monthKey] ?? null;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState(value !== null ? String(value) : '');
  const [saving, setSaving]   = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { setDraft(value !== null ? String(value) : ''); }, [value]);
  useEffect(() => { if (editing && inputRef.current) inputRef.current.focus(); }, [editing]);

  const commit = useCallback(async () => {
    setEditing(false);
    const newVal = draft.trim() === '' ? null : Number(draft.trim());
    if (newVal === value) return;
    setSaving(true);
    try {
      const newParsed = { ...parsed };
      if (newVal === null) { delete newParsed[monthKey]; } else { newParsed[monthKey] = newVal; }
      const newTotal = Object.values(newParsed).reduce((s, v) => s + v, 0);
      const res = await inputApi.updateRecord(recordId, {
        monthly_data: JSON.stringify(newParsed),
        total_incidences: newTotal,
      });
      onSaved(recordId, res.data);
    } catch {
      setDraft(value !== null ? String(value) : '');
    } finally {
      setSaving(false);
    }
  }, [draft, value, parsed, monthKey, recordId, onSaved]);

  const onKeyDown = (e) => {
    if (e.key === 'Enter')  commit();
    if (e.key === 'Escape') { setDraft(value !== null ? String(value) : ''); setEditing(false); }
  };

  if (saving) return <td className="sdm-cell-saving sdm-monthly"><Loader size={12} className="sdm-spin" /></td>;

  if (editing) {
    return (
      <td className="sdm-cell-editing sdm-monthly">
        <input ref={inputRef} type="number" value={draft}
          className="sdm-cell-input"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit} onKeyDown={onKeyDown}
        />
      </td>
    );
  }

  return (
    <td
      className={`sdm-cell-view sdm-monthly${value !== null ? ' sdm-monthly--has' : ''}`}
      onClick={() => setEditing(true)} title="Click to edit"
    >
      {value !== null ? value : ''}
    </td>
  );
}

// ── Audit column definitions (mirrored from InputData) ───────────────────────
const LAYERED_AUDIT_COLS = [
  { key: 'model',          label: 'Model',          width: 120 },
  { key: 'sr_no',          label: 'Sr.No',          width: 200 },
  { key: 'date_col',       label: 'Date',           width: 110 },
  { key: 'station_id',     label: 'Station ID',     width: 110 },
  { key: 'workstation',    label: 'Workstation',    width: 180 },
  { key: 'auditor',        label: 'Auditor',        width: 200 },
  { key: 'ncs',            label: "NC's",           width: 280 },
  { key: 'action_plan',    label: 'Action Plan',    width: 280 },
  { key: 'four_m',         label: '4M',             width: 100 },
  { key: 'responsibility', label: 'Responsibility', width: 160 },
  { key: 'target_date',    label: 'Target Date',    width: 110 },
  { key: 'status',         label: 'Status',         width: 90  },
];

const LAYERED_ADHERENCE_COLS = [
  { key: 'stage_no',   label: 'Stage No',   width: 110 },
  { key: 'stage_name', label: 'Stage Name', width: 220 },
  { key: 'auditor',    label: 'Auditor',    width: 200 },
  { key: 'audit_date', label: 'Audit Date', width: 120 },
];

// Simple read-only table for audit data inside the modal
function AuditReadTable({ columns, records, emptyMsg }) {
  if (records.length === 0) {
    return (
      <div className="sdm-empty">
        <TableProperties size={36} strokeWidth={1} />
        <p>{emptyMsg}</p>
      </div>
    );
  }
  return (
    <div className="sdm-table-wrap">
      <table className="sdm-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} style={{ minWidth: col.width }}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {records.map((rec, rowIdx) => (
            <tr key={rec.id} className={rowIdx % 2 === 0 ? 'sdm-row-even' : 'sdm-row-odd'}>
              {columns.map((col) => (
                <td key={col.key} className="sdm-cell-view">
                  {rec[col.key] != null && rec[col.key] !== ''
                    ? <span>{String(rec[col.key])}</span>
                    : <span className="sdm-cell-empty">—</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Allowed values for constrained fields ─────────────────────────────────────
const ALLOWED = {
  type:        ['WH', 'USV'],
  ryg:         ['R', 'Y', 'G'],
  attri:       ['M&M Design', 'M&M process', 'Supplier Design', 'Supplier Process', 'Under Analysis'],
  z_e:         ['Z', 'E'],
  attribution: ['M', 'P', 'D', 'U'],
  status_3m:   ['R', 'G'],
};

// Helper: returns current month + last 3 months (4 keys total, oldest first)
function getFormMonths() {
  const now = new Date();
  const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const months = [];
  for (let i = 3; i >= 1; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  months.push(currentKey);
  return months; // [3-months-ago, 2-months-ago, last-month, current]
}

const DOC_TYPES = [
  { key: 'DDR_LO',       label: 'DRF / L0' },
  { key: 'SOS',          label: 'SOS' },
  { key: 'PFMEA',        label: 'PFMEA' },
  { key: 'CONTROL_PLAN', label: 'Control Plan' },
  { key: 'CCR',          label: 'CCR' },
];

// ── Add Record Modal ──────────────────────────────────────────────────────────
function AddRecordModal({ type, stationId, onClose, onSaved, userId, layoutId, stationIds = [] }) {
  const formMonths = getFormMonths(); // current + last 3 (4 total)

  const defaultMaster = () => {
    const m = {};
    formMonths.forEach((k) => { m[k] = ''; });
    return {
      concern_id: '', concern: '', type: '', root_cause: '', action_plan: '',
      target_date: '', closure_date: '', ryg: '', attri: '', comm: '', line: '',
      stage_no: stationId || '', z_e: '', attribution: '', part: '', phenomena: '',
      status_3m: '', monthly: m,
    };
  };
  const defaultAudit = () => ({
    model: '', date_col: '', station_id: stationId || '',
    workstation: '', auditor: '', ncs: '', action_plan: '',
    four_m: '', responsibility: '', target_date: '', status: '',
  });
  const defaultAdherence = () => ({
    stage_no: stationId || '', stage_name: '', auditor: '', audit_date: '',
  });

  const [form, setForm] = useState(
    type === 'master' ? defaultMaster() :
    type === 'layered-audit' ? defaultAudit() :
    defaultAdherence()
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (key, val) => setForm((p) => ({ ...p, [key]: val }));
  const setMonthly = (key, val) => setForm((p) => ({ ...p, monthly: { ...p.monthly, [key]: val } }));

  // Auto-map: Attri. → Attribution
  const ATTRI_MAP = {
    'M&M Design': 'D', 'M&M process': 'P',
    'Supplier Design': 'D', 'Supplier Process': 'P', 'Under Analysis': 'U',
  };
  const handleAttriChange = (val) => {
    const mapped = ATTRI_MAP[val];
    setForm((p) => ({ ...p, attri: val, ...(mapped ? { attribution: mapped } : {}) }));
  };
  // Auto-map: Stage No → Line (prefix before first '-')
  const handleStageChange = (val) => {
    const dashIdx = val.indexOf('-');
    const autoLine = dashIdx > 0 ? val.substring(0, dashIdx) : '';
    setForm((p) => ({ ...p, stage_no: val, ...(autoLine ? { line: autoLine } : {}) }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      let res;
      if (type === 'master') {
        const monthlyObj = {};
        Object.entries(form.monthly).forEach(([k, v]) => {
          const n = parseInt(v, 10);
          if (!isNaN(n)) monthlyObj[k] = n;
        });
        const total = Object.values(monthlyObj).reduce((s, v) => s + v, 0);
        const payload = {
          // sr_no is auto-assigned by backend
          concern_id: form.concern_id || null,
          concern: form.concern || null,
          type: form.type || null,
          root_cause: form.root_cause || null,
          action_plan: form.action_plan || null,
          target_date: form.target_date || null,
          closure_date: form.closure_date || null,
          ryg: form.ryg || null,
          attri: form.attri || null,
          comm: form.comm || null,
          line: form.line || null,
          stage_no: form.stage_no || null,
          z_e: form.z_e || null,
          attribution: form.attribution || null,
          part: form.part || null,
          phenomena: form.phenomena || null,
          field_defect_after_cutoff: null, // not shown in form, always null
          status_3m: form.status_3m || null,
          monthly_data: Object.keys(monthlyObj).length ? JSON.stringify(monthlyObj) : null,
          total_incidences: total || null,
        };
        res = await inputApi.createRecord(payload, userId, layoutId);
      } else if (type === 'layered-audit') {
        const payload = {
          model: form.model || null,
          date_col: form.date_col || null, station_id: form.station_id || null,
          workstation: form.workstation || null, auditor: form.auditor || null,
          ncs: form.ncs || null, action_plan: form.action_plan || null,
          four_m: form.four_m || null, responsibility: form.responsibility || null,
          target_date: form.target_date || null, status: form.status || null,
        };
        res = await layeredAuditApi.createAuditRecord(payload, userId, layoutId);
      } else {
        const payload = {
          stage_no: form.stage_no || null, stage_name: form.stage_name || null,
          auditor: form.auditor || null, audit_date: form.audit_date || null,
        };
        res = await layeredAuditApi.createAdherenceRecord(payload, userId, layoutId);
      }
      onSaved(res.data);
      onClose();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save record.');
    } finally {
      setSaving(false);
    }
  };

  const sel = (key, opts) => (
    <select className="sdm-form-input" value={form[key] || ''} onChange={(e) => set(key, e.target.value)}>
      <option value="">— select —</option>
      {opts.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
  const inp = (key, t = 'text') => (
    <input className="sdm-form-input" type={t} value={form[key] || ''} onChange={(e) => set(key, e.target.value)} />
  );
  const ta = (key) => (
    <textarea className="sdm-form-textarea" rows={2} value={form[key] || ''} onChange={(e) => set(key, e.target.value)} />
  );

  return createPortal(
    <div className="sdm-overlay" onClick={onClose}>
      <div className="sdm-modal sdm-modal--form" onClick={(e) => e.stopPropagation()}>
        <div className="sdm-header">
          <div className="sdm-header-left">
            <div className="sdm-header-icon"><Plus size={18} /></div>
            <div>
              <div className="sdm-title">Add Record — {
                type === 'master' ? 'Master Data' :
                type === 'layered-audit' ? 'Layered Audit' : 'Audit Adherence'
              }</div>
              <div className="sdm-subtitle">Station: <strong>{stationId}</strong></div>
            </div>
          </div>
          <button className="sdm-close" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="sdm-body sdm-body--form">
          {type === 'master' && (
            <div className="sdm-form-grid">
              <label>Concern ID{inp('concern_id')}</label>
              <label className="sdm-form-full">Concern{ta('concern')}</label>
              <label>Type {sel('type', ALLOWED.type)}</label>
              <label>RYG {sel('ryg', ALLOWED.ryg)}</label>
              <label>Z/E {sel('z_e', ALLOWED.z_e)}</label>
              <label>Attribution {sel('attribution', ALLOWED.attribution)}</label>
              <label>Attri.
                <select className="sdm-form-input" value={form.attri || ''} onChange={(e) => handleAttriChange(e.target.value)}>
                  <option value="">— select —</option>
                  {ALLOWED.attri.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </label>
              <label>Status (3M) {sel('status_3m', ALLOWED.status_3m)}</label>
              <label>Stage No
                <select className="sdm-form-input" value={form.stage_no || ''} onChange={(e) => handleStageChange(e.target.value)}>
                  <option value="">— select —</option>
                  {stationIds.map((id) => <option key={id} value={id}>{id}</option>)}
                </select>
              </label>
              <label>Line{inp('line')}</label>
              <label>Part{inp('part')}</label>
              <label>Phenomena{inp('phenomena')}</label>
              <label>Target Date{inp('target_date')}</label>
              <label>Closure Date{inp('closure_date')}</label>
              <label className="sdm-form-full">Root Cause{ta('root_cause')}</label>
              <label className="sdm-form-full">Action Plan{ta('action_plan')}</label>
              <label className="sdm-form-full">Commodity{ta('comm')}</label>
              <div className="sdm-form-full">
                <div className="sdm-form-section-title">Monthly Incidences (current + last 3 months)</div>
                <div className="sdm-form-months">
                  {formMonths.map((k) => (
                    <label key={k}>{fmtMonth(k)}
                      <input
                        className="sdm-form-input sdm-form-input--month"
                        type="number" min="0"
                        value={form.monthly[k] || ''}
                        onChange={(e) => setMonthly(k, e.target.value)}
                      />
                    </label>
                  ))}
                </div>
                <p className="sdm-form-note">
                  ℹ️ To add records for more months, use the Excel upload in the Input section.
                </p>
              </div>
            </div>
          )}

          {type === 'layered-audit' && (
            <div className="sdm-form-grid">
              <label>Model{inp('model')}</label>
              <label>Date{inp('date_col')}</label>
              <label>Station ID
                <select className="sdm-form-input" value={form.station_id || ''} onChange={(e) => set('station_id', e.target.value)}>
                  <option value="">— select —</option>
                  {stationIds.map((id) => <option key={id} value={id}>{id}</option>)}
                </select>
              </label>
              <label>Workstation{inp('workstation')}</label>
              <label>Auditor{inp('auditor')}</label>
              <label className="sdm-form-full">NC's{ta('ncs')}</label>
              <label className="sdm-form-full">Action Plan{ta('action_plan')}</label>
              <label>4M{inp('four_m')}</label>
              <label>Responsibility{inp('responsibility')}</label>
              <label>Target Date{inp('target_date')}</label>
              <label>Status{inp('status')}</label>
            </div>
          )}

          {type === 'audit-adherence' && (
            <div className="sdm-form-grid">
              <label>Stage No
                <select className="sdm-form-input" value={form.stage_no || ''} onChange={(e) => set('stage_no', e.target.value)}>
                  <option value="">— select —</option>
                  {stationIds.map((id) => <option key={id} value={id}>{id}</option>)}
                </select>
              </label>
              <label>Stage Name{inp('stage_name')}</label>
              <label>Auditor{inp('auditor')}</label>
              <label>Audit Date{inp('audit_date')}</label>
            </div>
          )}

          {error && (
            <div className="sdm-form-error">
              <AlertCircle size={15} /> {error}
            </div>
          )}
        </div>

        <div className="sdm-footer">
          <button className="sdm-footer-close" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="sdm-footer-save" onClick={handleSave} disabled={saving}>
            {saving ? <><Loader size={13} className="sdm-spin" /> Saving…</> : 'Save Record'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Docs Tab ──────────────────────────────────────────────────────────────────
function DocsTab({ stationId, masterRecords, userId, layoutId }) {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState({});  // key = `${concernId}__${docType}`
  const [uploadMsg, setUploadMsg] = useState({});
  const fileRefs = useRef({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await docApi.listDocs(stationId, userId, layoutId);
      setDocs(Array.isArray(res.data) ? res.data : []);
    } catch {
      setDocs([]);
    } finally {
      setLoading(false);
    }
  }, [stationId, userId, layoutId]);

  useEffect(() => { load(); }, [load]);

  const handleUpload = async (file, concernId, docType) => {
    const key = `${concernId}__${docType}`;
    setUploading((p) => ({ ...p, [key]: true }));
    setUploadMsg((p) => ({ ...p, [key]: null }));
    try {
      await docApi.uploadDoc(file, userId, layoutId, stationId, concernId, docType);
      setUploadMsg((p) => ({ ...p, [key]: { ok: true, text: 'Uploaded!' } }));
      load();
    } catch (err) {
      setUploadMsg((p) => ({ ...p, [key]: { ok: false, text: err.response?.data?.detail || 'Upload failed' } }));
    } finally {
      setUploading((p) => ({ ...p, [key]: false }));
    }
  };

  const handleDelete = async (docId) => {
    try {
      await docApi.deleteDoc(docId);
      setDocs((p) => p.filter((d) => d.id !== docId));
    } catch {}
  };

  const concerns = masterRecords.length > 0
    ? [...new Map(masterRecords.map((r) => [r.concern_id, r])).values()]
    : [];

  if (loading) return <div className="sdm-empty"><Loader size={28} className="sdm-spin" /><p>Loading documents…</p></div>;

  if (concerns.length === 0) {
    return (
      <div className="sdm-empty">
        <FileText size={36} strokeWidth={1} />
        <p>No master data records found for station <strong>{stationId}</strong>.</p>
        <p className="sdm-empty-hint">Upload master data with Stage No = {stationId} first, then documents will be linked here.</p>
      </div>
    );
  }

  return (
    <div className="sdm-docs-container">
      {concerns.map((rec) => {
        const cid = rec.concern_id || '(no concern ID)';
        const clabel = rec.concern ? `${cid} — ${rec.concern.slice(0, 60)}` : cid;
        return (
          <div key={cid} className="sdm-docs-concern">
            <div className="sdm-docs-concern-title">{clabel}</div>
            <div className="sdm-docs-types">
              {DOC_TYPES.map(({ key, label }) => {
                const uploaded = docs.filter((d) => d.concern_id === rec.concern_id && d.doc_type === key);
                const uKey = `${cid}__${key}`;
                const msg = uploadMsg[uKey];
                const inputId = `doc-upload-${cid}-${key}`.replace(/[^a-z0-9-]/gi, '_');
                return (
                  <div key={key} className="sdm-doc-type-card">
                    <div className="sdm-doc-type-label">{label}</div>
                    <div className="sdm-doc-list">
                      {uploaded.map((d) => (
                        <div key={d.id} className="sdm-doc-item">
                          <a
                            href={docApi.getDownloadUrl(d.id)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="sdm-doc-link"
                          >
                            <FileText size={12} /> {d.filename}
                          </a>
                          <button
                            className="sdm-doc-delete"
                            onClick={() => handleDelete(d.id)}
                            title="Delete"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      ))}
                      {uploaded.length === 0 && (
                        <span className="sdm-doc-empty">No file uploaded</span>
                      )}
                    </div>
                    <div className="sdm-doc-upload-row">
                      <input
                        id={inputId}
                        type="file"
                        className="sdm-doc-file-hidden"
                        onChange={(e) => {
                          const f = e.target.files[0];
                          if (f) { handleUpload(f, rec.concern_id, key); e.target.value = ''; }
                        }}
                      />
                      <label htmlFor={inputId} className="sdm-doc-upload-btn">
                        {uploading[uKey] ? <><Loader size={11} className="sdm-spin" /> Uploading…</> : <><Upload size={11} /> Upload</>}
                      </label>
                      {msg && (
                        <span className={`sdm-doc-msg${msg.ok ? ' sdm-doc-msg--ok' : ' sdm-doc-msg--err'}`}>
                          {msg.ok ? <CheckCircle size={11} /> : <AlertCircle size={11} />} {msg.text}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Station Detail Modal ───────────────────────────────────────────────────────
// Rendered via portal to document.body so position:fixed is always
// relative to the true viewport, regardless of ancestor transforms.
function StationDetailModal({ stationId, records, allMonths, onSaved, onClose, auditRecords, adherenceRecords, userId, layoutId, onRecordAdded, stationIds = [] }) {
  const [activeTab, setActiveTab] = useState('master');
  const [showAddRecord, setShowAddRecord] = useState(false);
  const filtered           = records.filter((r) => r.stage_no === stationId);
  const filteredAudit      = auditRecords.filter((r) => r.station_id === stationId);
  const filteredAdherence  = adherenceRecords.filter((r) => r.stage_no === stationId);

  // Close on Escape key
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Prevent body scroll while modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const modal = (
    <div className="sdm-overlay" onClick={onClose}>
      <div className="sdm-modal" onClick={(e) => e.stopPropagation()}>

        {/* ── Header ── */}
        <div className="sdm-header">
          <div className="sdm-header-left">
            <div className="sdm-header-icon"><TableProperties size={18} /></div>
            <div>
              <div className="sdm-title">Station <span className="sdm-station-id">{stationId}</span></div>
              <div className="sdm-subtitle">
                {activeTab === 'master' && 'Master data — click any cell to edit'}
                {activeTab === 'layered-audit' && 'Layered Audit records'}
                {activeTab === 'audit-adherence' && 'Audit Adherence records'}
                {activeTab === 'docs' && 'Documents linked to each concern'}
              </div>
            </div>
          </div>
          <div className="sdm-header-right">
            {activeTab === 'master' && (
              <span className="sdm-count">{filtered.length} record{filtered.length !== 1 ? 's' : ''}</span>
            )}
            {activeTab === 'layered-audit' && (
              <span className="sdm-count">{filteredAudit.length} record{filteredAudit.length !== 1 ? 's' : ''}</span>
            )}
            {activeTab === 'audit-adherence' && (
              <span className="sdm-count">{filteredAdherence.length} record{filteredAdherence.length !== 1 ? 's' : ''}</span>
            )}
            {activeTab !== 'docs' && (
              <button className="sdm-add-btn" onClick={() => setShowAddRecord(true)} title="Add new record">
                <Plus size={14} /> Add Record
              </button>
            )}
            <button className="sdm-close" onClick={onClose} title="Close (Esc)"><X size={16} /></button>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="sdm-tabs">
          <button
            className={`sdm-tab${activeTab === 'master' ? ' sdm-tab--active' : ''}`}
            onClick={() => setActiveTab('master')}
          >
            Master Data
          </button>
          <button
            className={`sdm-tab${activeTab === 'layered-audit' ? ' sdm-tab--active' : ''}`}
            onClick={() => setActiveTab('layered-audit')}
          >
            Layered Audit
          </button>
          <button
            className={`sdm-tab${activeTab === 'audit-adherence' ? ' sdm-tab--active' : ''}`}
            onClick={() => setActiveTab('audit-adherence')}
          >
            Audit Adherence
          </button>
          <button
            className={`sdm-tab${activeTab === 'docs' ? ' sdm-tab--active' : ''}`}
            onClick={() => setActiveTab('docs')}
          >
            <FileText size={13} style={{ marginRight: 4 }} />Docs
          </button>
        </div>

        {/* ── Body ── */}
        <div className="sdm-body">

          {/* Master Data tab */}
          {activeTab === 'master' && (
            filtered.length === 0 ? (
              <div className="sdm-empty">
                <TableProperties size={36} strokeWidth={1} />
                <p>No input records found for station <strong>{stationId}</strong>.</p>
                <p className="sdm-empty-hint">Upload data in the Input section with Stage No = {stationId}</p>
              </div>
            ) : (
              <div className="sdm-table-wrap">
                <table className="sdm-table">
                  <thead>
                    <tr>
                      {FIXED_COLS.map((col, i) => (
                        <th
                          key={col.key}
                          className={i < 3 ? 'sdm-sticky-col' : ''}
                          style={{ minWidth: col.width, left: i === 0 ? 0 : i === 1 ? 60 : i === 2 ? 190 : undefined }}
                        >
                          {col.label}
                        </th>
                      ))}
                      {allMonths.map((key) => (
                        <th key={key} className="sdm-month-th">{fmtMonth(key)}</th>
                      ))}
                      {TRAILING_COLS.map((col) => (
                        <th key={col.key} style={{ minWidth: col.width }}>{col.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((rec, rowIdx) => (
                      <tr key={rec.id} className={rowIdx % 2 === 0 ? 'sdm-row-even' : 'sdm-row-odd'}>
                        {FIXED_COLS.map((col, i) => (
                          <EditableCell
                            key={col.key}
                            recordId={rec.id}
                            fieldKey={col.key}
                            value={rec[col.key]}
                            type={col.type}
                            onSaved={onSaved}
                            stickyLeft={i < 3 ? (i === 0 ? 0 : i === 1 ? 60 : 190) : undefined}
                          />
                        ))}
                        {allMonths.map((key) => (
                          <MonthlyCell
                            key={key}
                            recordId={rec.id}
                            monthKey={key}
                            monthlyData={rec.monthly_data}
                            onSaved={onSaved}
                          />
                        ))}
                        {TRAILING_COLS.map((col) => (
                          <EditableCell
                            key={col.key}
                            recordId={rec.id}
                            fieldKey={col.key}
                            value={rec[col.key]}
                            type={col.type}
                            onSaved={onSaved}
                          />
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}

          {/* Layered Audit tab */}
          {activeTab === 'layered-audit' && (
            <AuditReadTable
              columns={LAYERED_AUDIT_COLS}
              records={filteredAudit}
              emptyMsg={`No Layered Audit records found for station ${stationId}. Upload data with Station ID = ${stationId}.`}
            />
          )}

          {/* Audit Adherence tab */}
          {activeTab === 'audit-adherence' && (
            <AuditReadTable
              columns={LAYERED_ADHERENCE_COLS}
              records={filteredAdherence}
              emptyMsg={`No Audit Adherence records found for station ${stationId}. Upload data with Stage No = ${stationId}.`}
            />
          )}

          {/* Docs tab */}
          {activeTab === 'docs' && (
            <DocsTab
              stationId={stationId}
              masterRecords={filtered}
              userId={userId}
              layoutId={layoutId}
            />
          )}

        </div>

        {/* ── Footer ── */}
        <div className="sdm-footer">
          <span className="sdm-footer-hint">
            {activeTab === 'master'
              ? 'Changes save automatically · Scroll horizontally to see monthly columns'
              : activeTab === 'docs'
              ? 'Upload documents per concern and document type'
              : 'Scroll horizontally to see all columns'}
          </span>
          <button className="sdm-footer-close" onClick={onClose}>Close</button>
        </div>

      </div>
    </div>
  );

  return (
    <>
      {createPortal(modal, document.body)}
      {showAddRecord && (
        <AddRecordModal
          type={activeTab}
          stationId={stationId}
          onClose={() => setShowAddRecord(false)}
          onSaved={(newRec) => {
            if (onRecordAdded) onRecordAdded(activeTab, newRec);
            setShowAddRecord(false);
          }}
          userId={userId}
          layoutId={layoutId}
          stationIds={stationIds}
        />
      )}
    </>
  );
}

// ── Parse API layout into flat state ─────────────────────────────────────────
function parseLayout(apiLayout) {
  if (!apiLayout || typeof apiLayout !== 'object') {
    return { boxes: [], buyoffIcons: [], connections: [] };
  }
  const boxes = (apiLayout.station_boxes || []).map((b) => {
    let description = '';
    let stationNames = [];
    if (b.station_data) {
      try {
        const sd = typeof b.station_data === 'string' ? JSON.parse(b.station_data) : b.station_data;
        description = sd.__box_desc__ || '';
        stationNames = Array.isArray(sd.__station_names__) ? sd.__station_names__ : [];
      } catch {}
    }
    return {
      id: `db-box-${b.id}`,
      name: b.name,
      description,
      stationNames,
      stationIds: b.station_ids
        ? (typeof b.station_ids === 'string' ? b.station_ids.split(',') : b.station_ids)
        : [],
      position: { x: b.position_x, y: b.position_y },
    };
  });

  const buyoffIcons = (apiLayout.buyoff_icons || []).map((ic) => ({
    id: `db-buyoff-${ic.id}`,
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

  // Normalize negative coordinates — shift everything so min x/y ≥ GRID (40px)
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

  let textLabels = [];
  try {
    textLabels = apiLayout.text_labels ? JSON.parse(apiLayout.text_labels) : [];
  } catch { textLabels = []; }

  let canvasArrows = [];
  let drawnPaths   = [];
  try {
    const all = apiLayout.canvas_arrows ? JSON.parse(apiLayout.canvas_arrows) : [];
    canvasArrows = all.filter((a) => a.type !== 'drawn_path');
    drawnPaths   = all.filter((a) => a.type === 'drawn_path');
  } catch { canvasArrows = []; drawnPaths = []; }

  return { boxes: shiftedBoxes, buyoffIcons: shiftedBuyoff, connections, textLabels, canvasArrows, drawnPaths };
}

// ── Compute display data for one station ──────────────────────────────────────
// ze:       'Z' | 'E' | null   — symbol to show (E has priority)
// zeStatus: 'red' | 'green'    — red = has active incidences, green = stage exists but clean
// Attrs P/M/D/U: 'X/Y' — X active (total_incidences>0), Y=sum of total_incidences; omit if Y=0
function computeStationData(records, stationId) {
  const sr = records.filter((r) => r.stage_no === stationId);

  const eRecs = sr.filter((r) => r.z_e === 'E');
  const zRecs = sr.filter((r) => r.z_e === 'Z');

  let ze = null;
  let zeStatus = null; // 'red' | 'green'

  if (eRecs.length > 0) {
    ze = 'E';
    const eRecsR = eRecs.filter((r) => r.status_3m === 'R');
    zeStatus = eRecsR.some((r) => (r.total_incidences || 0) > 0) ? 'red' : 'green';
  } else if (zRecs.length > 0) {
    ze = 'Z';
    const zRecsR = zRecs.filter((r) => r.status_3m === 'R');
    zeStatus = zRecsR.some((r) => (r.total_incidences || 0) > 0) ? 'red' : 'green';
  }

  // Only count records where status_3m is 'R' for MPDU values
  const srFiltered = sr.filter((r) => r.status_3m === 'R');

  const attrs = {};
  for (const attr of ['P', 'M', 'D', 'U']) {
    const attrRecs = srFiltered.filter((r) => r.attribution === attr);
    // Y = sum of total_incidences across all records for this attribution
    const Y = attrRecs.reduce((sum, r) => sum + (r.total_incidences || 0), 0);
    if (Y === 0) continue; // don't show if no incidences at all
    // X = count of records that individually have total_incidences > 0
    const X = attrRecs.filter((r) => (r.total_incidences || 0) > 0).length;
    attrs[attr] = `${X}/${Y}`;
  }

  return { ze, zeStatus, attrs };
}

// ── Legend data computation ───────────────────────────────────────────────────
// TYPE table:   rows = TOTAL + one per unique type value
//   columns: Phenomenons (record count), Incidences (sum total_incidences),
//            Stages (unique stage_no count), Red (unique stage_no with ryg='R'),
//            Effectiveness = (Stages - Red) / Stages * 100%
// ATTRIBUTION table: rows ordered P→D→M→U
//   columns: Label, Phenomenons (count), Incidences (sum)
const ATTR_ORDER  = ['P', 'D', 'M', 'U'];
const ATTR_LABELS = { P: 'Parts', D: 'Design', M: 'Process', U: 'U/A' };

function computeLegendData(records) {
  const makeTypeRow = (label, recs) => {
    const phenomenons = recs.length;
    const incidences  = recs.reduce((s, r) => s + (r.total_incidences || 0), 0);
    const stages      = new Set(recs.map((r) => r.stage_no).filter(Boolean)).size;
    const red         = new Set(
      recs.filter((r) => r.ryg === 'R').map((r) => r.stage_no).filter(Boolean)
    ).size;
    const effectiveness = stages > 0 ? Math.round(((stages - red) / stages) * 100) : 0;
    return { label, phenomenons, incidences, stages, red, effectiveness };
  };

  const typeMap = {};
  records.forEach((r) => {
    const t = r.type || 'Unknown';
    (typeMap[t] = typeMap[t] || []).push(r);
  });

  const totalRow = makeTypeRow('TOTAL', records);
  const typeRows = Object.keys(typeMap).sort().map((t) => makeTypeRow(t, typeMap[t]));

  const attrMap = {};
  records.forEach((r) => {
    if (r.attribution) (attrMap[r.attribution] = attrMap[r.attribution] || []).push(r);
  });
  const attrRows = ATTR_ORDER.filter((a) => attrMap[a]).map((a) => ({
    label:        ATTR_LABELS[a] || a,
    phenomenons:  attrMap[a].length,
    incidences:   attrMap[a].reduce((s, r) => s + (r.total_incidences || 0), 0),
  }));

  return { totalRow, typeRows, attrRows };
}

// ── Draggable Legend Box (lives inside the canvas, scales with zoom) ──────────
function LegendBox({ legendData, position, transformScale, onDragEnd }) {
  const posRef = useRef(position);
  posRef.current = position;

  const onMouseDown = useCallback((e) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();

    const startX     = e.clientX;
    const startY     = e.clientY;
    const origX      = posRef.current.x;
    const origY      = posRef.current.y;
    const scale      = transformScale;

    const onMove = (ev) => {
      const dx = (ev.clientX - startX) / scale;
      const dy = (ev.clientY - startY) / scale;
      onDragEnd({ x: origX + dx, y: origY + dy }, false /* not committed yet */);
    };

    const onUp = (ev) => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
      const dx = (ev.clientX - startX) / scale;
      const dy = (ev.clientY - startY) / scale;
      onDragEnd({ x: origX + dx, y: origY + dy }, true /* commit to DB */);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
  }, [transformScale, onDragEnd]);

  const { totalRow, typeRows, attrRows } = legendData;

  return (
    <div
      className="dash-legend-box"
      style={{ position: 'absolute', left: position.x, top: position.y }}
      onMouseDown={onMouseDown}
    >
      {/* TYPE section */}
      <div className="dlb-section-title">TYPE</div>
      <table className="dlb-table dlb-table--type">
        <thead>
          <tr>
            <th className="dlb-th dlb-th--label"></th>
            <th className="dlb-th">Phenom.</th>
            <th className="dlb-th">Incid.</th>
            <th className="dlb-th">Stages</th>
            <th className="dlb-th dlb-th--red">Red</th>
            <th className="dlb-th">Eff.%</th>
          </tr>
        </thead>
        <tbody>
          <tr className="dlb-row dlb-row--total">
            <td className="dlb-td dlb-td--label">TOTAL</td>
            <td className="dlb-td">{totalRow.phenomenons}</td>
            <td className="dlb-td">{totalRow.incidences}</td>
            <td className="dlb-td">{totalRow.stages}</td>
            <td className="dlb-td dlb-td--red">{totalRow.red}</td>
            <td className="dlb-td">{totalRow.effectiveness}%</td>
          </tr>
          {typeRows.map((row) => (
            <tr key={row.label} className="dlb-row">
              <td className="dlb-td dlb-td--label">{row.label}</td>
              <td className="dlb-td">{row.phenomenons}</td>
              <td className="dlb-td">{row.incidences}</td>
              <td className="dlb-td">{row.stages}</td>
              <td className="dlb-td dlb-td--red">{row.red}</td>
              <td className="dlb-td">{row.effectiveness}%</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ATTRIBUTION section */}
      {attrRows.length > 0 && (
        <>
          <div className="dlb-section-title dlb-section-title--attr">ATTRIBUTION</div>
          <table className="dlb-table dlb-table--attr">
            <thead>
              <tr>
                <th className="dlb-th dlb-th--label"></th>
                <th className="dlb-th">Phenom.</th>
                <th className="dlb-th">Incid.</th>
              </tr>
            </thead>
            <tbody>
              {attrRows.map((row) => (
                <tr key={row.label} className="dlb-row">
                  <td className="dlb-td dlb-td--label">{row.label}</td>
                  <td className="dlb-td">{row.phenomenons}</td>
                  <td className="dlb-td">{row.incidences}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <div className="dlb-drag-hint">drag to reposition</div>
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
function ZStageDashboard({ userId, activeLayoutId = null, refreshSignal = 0, savedLayouts = null, isActive = true }) {
  const [layouts, setLayouts]         = useState([]);
  const [selectedId, setSelectedId]   = useState(null);
  const [boxes, setBoxes]             = useState([]);
  const [buyoffIcons, setBuyoffIcons] = useState([]);
  const [connections, setConnections] = useState([]);
  const [textLabels, setTextLabels]   = useState([]);
  const [canvasArrows, setCanvasArrows] = useState([]);
  const [drawnPaths,   setDrawnPaths  ] = useState([]);
  const [records, setRecords]         = useState([]);
  const [auditRecords, setAuditRecords]       = useState([]);
  const [adherenceRecords, setAdherenceRecords] = useState([]);
  const [loading, setLoading]         = useState(false);
  const [refreshing, setRefreshing]   = useState(false);
  const [error, setError]             = useState(null);
  const [transformState, setTransformState] = useState({ scale: 1, positionX: 0, positionY: 0 });

  // Legend position (canvas coordinates) – null until layout is loaded
  const [legendPos, setLegendPos] = useState(null);

  // Station detail popup
  const [popupStation, setPopupStation] = useState(null); // stationId string | null

  const canvasRef   = useRef(null);
  const transformRef = useRef(null);

  const fitView = useCallback((loadedBoxes, loadedBuyoffIcons) => {
    if (!transformRef.current) return;
    if (loadedBoxes.length === 0 && loadedBuyoffIcons.length === 0) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const BOX_H = 5 * GRID; // 200px — mirrors LayoutPreparation boxSize height

    loadedBoxes.forEach((box) => {
      const w = boxWidth(box.stationIds.length);
      minX = Math.min(minX, box.position.x);
      minY = Math.min(minY, box.position.y);
      maxX = Math.max(maxX, box.position.x + w);
      maxY = Math.max(maxY, box.position.y + BOX_H);
    });

    loadedBuyoffIcons.forEach((icon) => {
      minX = Math.min(minX, icon.position.x);
      minY = Math.min(minY, icon.position.y);
      maxX = Math.max(maxX, icon.position.x + 80);
      maxY = Math.max(maxY, icon.position.y + 80);
    });

    const el = canvasRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();

    const PAD = 80;
    const contentW = maxX - minX + PAD * 2;
    const contentH = maxY - minY + PAD * 2;

    const scaleByW = rect.width  / contentW;
    const scaleByH = rect.height / contentH;
    const scale = Math.min(scaleByW, scaleByH, 1) * 0.76;

    const posX = (rect.width  - contentW * scale) / 2 - (minX - PAD) * scale;
    const posY = (rect.height - contentH * scale) / 2 - (minY - PAD) * scale;

    transformRef.current.setTransform(posX, posY, scale, 300);
  }, []);

  // Derive all months present in loaded records (same logic as InputData)
  const allMonths = React.useMemo(() => {
    const set = new Set(MONTHLY_KEYS);
    records.forEach((rec) => {
      if (rec.monthly_data) {
        try { Object.keys(JSON.parse(rec.monthly_data)).forEach((k) => set.add(k)); } catch {}
      }
    });
    return Array.from(set).sort();
  }, [records]);

  // Sync layout list from prop (kept up-to-date by ZStage parent) or fetch once if no prop
  useEffect(() => {
    if (savedLayouts !== null) return; // handled by the prop-sync effect below
    layoutApi.getLayouts(userId)
      .then((r) => {
        const list = Array.isArray(r.data) ? r.data : [];
        setLayouts(list);
        if (list.length === 0) {
          setError('No layouts found. Create and save a layout first.');
          return;
        }
        const preferred = activeLayoutId && list.find((l) => l.id === activeLayoutId);
        setSelectedId(preferred ? preferred.id : list[0].id);
      })
      .catch(() => {
        setError('Failed to load layouts — check backend is running on port 5000');
      });
  }, [userId]); // eslint-disable-line

  // Keep layout list in sync when parent updates savedLayouts (create / delete)
  useEffect(() => {
    if (savedLayouts === null) return;
    const list = Array.isArray(savedLayouts) ? savedLayouts : [];
    setLayouts(list);
    if (list.length === 0) {
      setSelectedId(null);
      setError('No layouts found. Create and save a layout first.');
      return;
    }
    setError(null);
    setSelectedId((prev) => {
      // Keep current selection if it still exists
      if (prev && list.find((l) => l.id === prev)) return prev;
      // Prefer the layout open in the editor
      const preferred = activeLayoutId && list.find((l) => l.id === activeLayoutId);
      return preferred ? preferred.id : list[0].id;
    });
  }, [savedLayouts]); // eslint-disable-line

  // Load layout + records when selection changes
  useEffect(() => {
    if (!selectedId) return;
    setLoading(true);
    setError(null);

    Promise.all([
      layoutApi.getLayout(selectedId),
      inputApi.getRecords(userId, selectedId),
      layeredAuditApi.getAuditRecords(userId, selectedId),
      layeredAuditApi.getAdherenceRecords(userId, selectedId),
    ])
      .then(([layoutRes, recordsRes, auditRes, adherenceRes]) => {
        const state = parseLayout(layoutRes.data);
        setBoxes(state.boxes);
        setBuyoffIcons(state.buyoffIcons);
        setConnections(state.connections);
        setTextLabels(state.textLabels || []);
        setCanvasArrows(state.canvasArrows || []);
        setDrawnPaths(state.drawnPaths || []);
        setRecords(Array.isArray(recordsRes.data) ? recordsRes.data : []);
        setAuditRecords(Array.isArray(auditRes.data) ? auditRes.data : []);
        setAdherenceRecords(Array.isArray(adherenceRes.data) ? adherenceRes.data : []);

        // Restore saved legend position or compute a default to the right of content
        if (layoutRes.data.legend_position_x != null && layoutRes.data.legend_position_y != null) {
          setLegendPos({ x: layoutRes.data.legend_position_x, y: layoutRes.data.legend_position_y });
        } else {
          const allBoxes = state.boxes;
          if (allBoxes.length > 0) {
            const maxX = Math.max(...allBoxes.map((b) => b.position.x + boxWidth(b.stationIds.length)));
            const minY = Math.min(...allBoxes.map((b) => b.position.y));
            setLegendPos({ x: maxX + 80, y: minY });
          } else {
            setLegendPos({ x: 500, y: 100 });
          }
        }

        setTimeout(() => fitView(state.boxes, state.buyoffIcons), 80);
      })
      .catch(() => setError('Failed to load layout'))
      .finally(() => setLoading(false));
  }, [selectedId, userId, fitView]);

  const handleRefresh = () => {
    setRefreshing(true);
    const calls = [
      inputApi.getRecords(userId, selectedId).then((r) => setRecords(Array.isArray(r.data) ? r.data : [])),
      layeredAuditApi.getAuditRecords(userId, selectedId).then((r) => setAuditRecords(Array.isArray(r.data) ? r.data : [])),
      layeredAuditApi.getAdherenceRecords(userId, selectedId).then((r) => setAdherenceRecords(Array.isArray(r.data) ? r.data : [])),
    ];
    if (selectedId) {
      calls.push(
        layoutApi.getLayout(selectedId).then((r) => {
          const state = parseLayout(r.data);
          setBoxes(state.boxes);
          setBuyoffIcons(state.buyoffIcons);
          setConnections(state.connections);
          setTextLabels(state.textLabels || []);
          setCanvasArrows(state.canvasArrows || []);
        setDrawnPaths(state.drawnPaths || []);
        })
      );
    }
    Promise.allSettled(calls).finally(() => setRefreshing(false));
  };

  // When a record is saved in the popup, update records state so dashboard re-renders
  const handleRecordSaved = useCallback((recordId, updatedRecord) => {
    setRecords((prev) => prev.map((r) => (r.id === recordId ? updatedRecord : r)));
  }, []);

  // When a new record is added via form popup, append it to the right list
  const handleRecordAdded = useCallback((tabType, newRec) => {
    if (tabType === 'master') {
      setRecords((prev) => [...prev, newRec]);
    } else if (tabType === 'layered-audit') {
      setAuditRecords((prev) => [...prev, newRec]);
    } else if (tabType === 'audit-adherence') {
      setAdherenceRecords((prev) => [...prev, newRec]);
    }
  }, []);

  // Legend data derived from all records
  const legendData = React.useMemo(() => computeLegendData(records), [records]);

  // Mirror handleRefresh so the signal effect always calls the latest version
  const handleRefreshRef = useRef(null);
  handleRefreshRef.current = handleRefresh;

  // Auto-refresh when a layout save completes in the editor
  const prevSignalRef = useRef(0);
  useEffect(() => {
    if (refreshSignal <= 0 || refreshSignal === prevSignalRef.current) return;
    prevSignalRef.current = refreshSignal;
    if (selectedId) handleRefreshRef.current?.();
  }, [refreshSignal, selectedId]);

  // Drag callback: update position live; auto-save to DB on commit
  const handleLegendDrag = useCallback((newPos, commit) => {
    setLegendPos(newPos);
    if (commit && selectedId) {
      layoutApi.updateLayout(selectedId, {
        legend_position_x: newPos.x,
        legend_position_y: newPos.y,
      }).catch(() => {/* non-critical */});
    }
  }, [selectedId]);

  return (
    <>
    {/* Xwrapper must wrap everything so Xarrow SVGs render in screen space */}
    <Xwrapper>
      <div className="z-dashboard">

        {/* ── Toolbar ──────────────────────────────────────────────────────── */}
        <div className="dash-toolbar">
          <div className="dash-toolbar-right">
            <div className="dash-legend">
              <span className="dash-legend-chip dash-legend-chip--red">Z</span>
              <span className="dash-legend-text">Active issues</span>
              <span className="dash-legend-chip dash-legend-chip--green">Z</span>
              <span className="dash-legend-text">No issues (clean)</span>
              <span className="dash-legend-sep" />
              <span className="dash-legend-chip dash-legend-chip--m">M</span>
              <span className="dash-legend-text">Manufacturing</span>
              <span className="dash-legend-chip dash-legend-chip--p">P</span>
              <span className="dash-legend-text">Part Quality</span>
              <span className="dash-legend-chip dash-legend-chip--d">D</span>
              <span className="dash-legend-text">Design</span>
              <span className="dash-legend-chip dash-legend-chip--u">U</span>
              <span className="dash-legend-text">Under Analysis</span>
              <span className="dash-legend-sep" />
              <span className="dash-legend-text dash-legend-hint">X/Y = active / total incidences · Click station header to view records</span>
            </div>
            <button className="dash-refresh-btn" onClick={handleRefresh} disabled={refreshing} title="Refresh data">
              <RefreshCw size={13} className={refreshing ? 'dash-spin' : ''} />
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
            {layouts.length > 0 && (
              <div className="dash-layout-select-wrap">
                <label className="dash-layout-label">Layout:</label>
                <select
                  className="dash-layout-select"
                  value={selectedId || ''}
                  onChange={(e) => setSelectedId(Number(e.target.value))}
                  disabled={layouts.length === 0}
                >
                  {layouts.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* ── Canvas ───────────────────────────────────────────────────────── */}
        <div
          ref={canvasRef}
          className="dash-canvas"
          style={{
            backgroundSize: `${GRID * transformState.scale}px ${GRID * transformState.scale}px`,
            backgroundPosition: `${transformState.positionX}px ${transformState.positionY}px`,
          }}
        >
          {loading && <div className="dash-overlay-msg">Loading layout…</div>}
          {error   && <div className="dash-overlay-msg dash-overlay-msg--error">{error}</div>}

          {!loading && !error && (
            <TransformWrapper
              ref={transformRef}
              limitToBounds={false}
              minScale={0.15}
              maxScale={3}
              wheel={{ step: 0.08 }}
              panning={{ excluded: ['dash-grid-th--clickable'] }}
              onTransformed={(_, state) =>
                setTransformState({ scale: state.scale, positionX: state.positionX, positionY: state.positionY })
              }
            >
              {({ zoomIn, zoomOut, resetTransform }) => (
                <>
                  <TransformComponent
                    wrapperStyle={{ width: '100%', height: '100%' }}
                    contentStyle={{ width: `${CANVAS_SIZE}px`, height: `${CANVAS_SIZE}px` }}
                  >
                    <div className="dash-virtual-canvas" style={{ width: CANVAS_SIZE, height: CANVAS_SIZE }}>

                      {/* Empty state */}
                      {boxes.length === 0 && buyoffIcons.length === 0 && (
                        <div className="dash-empty">
                          <p>No layout data to display.</p>
                          <p>Design a layout in the <strong>Layout</strong> section and upload data in the <strong>Input</strong> section.</p>
                        </div>
                      )}

                      {/* Buyoff icons */}
                      {buyoffIcons.map((icon) => (
                        <div
                          key={icon.id}
                          id={icon.id}
                          className="dash-buyoff"
                          style={{ position: 'absolute', left: icon.position.x, top: icon.position.y }}
                        >
                          {/* Invisible anchor points — match routeArrow.js tip offsets for 80×80 diamond.
                              top(40,0)  bottom(40,80)  left(0,40)  right(80,40) */}
                          <div id={`${icon.id}__top`}    style={{ position:'absolute', top:0,   left:40, width:1, height:1, pointerEvents:'none' }} />
                          <div id={`${icon.id}__bottom`} style={{ position:'absolute', top:80,  left:40, width:1, height:1, pointerEvents:'none' }} />
                          <div id={`${icon.id}__left`}   style={{ position:'absolute', top:40,  left:0,  width:1, height:1, pointerEvents:'none' }} />
                          <div id={`${icon.id}__right`}  style={{ position:'absolute', top:40,  left:80, width:1, height:1, pointerEvents:'none' }} />
                          <div className="dash-buyoff-diamond">
                            <GitBranch size={14} />
                          </div>
                        </div>
                      ))}

                      {/* Text labels — read-only mirror of layout editor */}
                      {textLabels.map((tl) => {
                        const w  = tl.w || 60;
                        const h  = tl.h || 14;
                        const fs = w <= 80 ? 7 : w <= 140 ? 12 : 16;
                        return (
                          <div
                            key={tl.id}
                            style={{
                              position: 'absolute',
                              left: tl.x,
                              top: tl.y,
                              width: w,
                              height: h,
                              fontSize: fs,
                              padding: '1px 0',
                              boxSizing: 'border-box',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-word',
                              overflow: 'hidden',
                              pointerEvents: 'none',
                              background: 'rgba(255,255,255,0.85)',
                              border: '1.5px dashed #9ca3af',
                              borderRadius: 4,
                              color: '#1a202c',
                              fontFamily: 'inherit',
                              fontWeight: 700,
                              lineHeight: 1.4,
                              textAlign: 'center',
                            }}
                          >
                            {tl.text}
                          </div>
                        );
                      })}

                      {/* Canvas arrows — read-only mirror of layout editor */}
                      {canvasArrows.map((arrow) => {
                        const w = arrow.w || 120;
                        const h = arrow.h || 50;
                        const degMap = { right: 0, down: 90, left: 180, up: 270 };
                        const deg = degMap[arrow.direction] || 0;
                        return (
                          <div
                            key={arrow.id}
                            style={{ position: 'absolute', left: arrow.x, top: arrow.y, width: w, height: h, pointerEvents: 'none' }}
                          >
                            <svg width={w} height={h} viewBox="0 0 100 100" preserveAspectRatio="none">
                              <polygon
                                points="0,30 62,30 62,8 100,50 62,92 62,70 0,70"
                                fill="#38a169"
                                opacity="0.82"
                                style={{ transform: `rotate(${deg}deg)`, transformOrigin: '50px 50px', transformBox: 'fill-box' }}
                              />
                            </svg>
                            {arrow.label && (
                              <div style={{
                                position: 'absolute', inset: 0,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: Math.max(7, Math.round(Math.min(w, h) * 0.22)),
                                color: '#fff', fontWeight: 600, textAlign: 'center',
                                padding: '0 6px', pointerEvents: 'none', lineHeight: 1.2,
                              }}>
                                {arrow.label}
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {/* Drawn paths — read-only SVG polylines from Draw Path tool */}
                      {drawnPaths.length > 0 && (
                        <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none' }}>
                          <defs>
                            {drawnPaths.map((p) => (
                              <marker key={p.id} id={`dash-dp-${p.id}`} markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto" markerUnits="userSpaceOnUse">
                                <polygon points="0 0, 8 3, 0 6" fill={p.color || '#2563eb'} />
                              </marker>
                            ))}
                          </defs>
                          {drawnPaths.map((p) => (
                            <polyline
                              key={p.id}
                              points={p.pts.map(([x, y]) => `${x},${y}`).join(' ')}
                              stroke={p.color || '#2563eb'}
                              strokeWidth={p.width || 2}
                              fill="none"
                              strokeLinejoin="round"
                              markerEnd={`url(#dash-dp-${p.id})`}
                            />
                          ))}
                        </svg>
                      )}

                      {/* Legend box – draggable, scales with canvas zoom */}
                      {legendPos && (
                        <LegendBox
                          legendData={legendData}
                          position={legendPos}
                          transformScale={transformState.scale}
                          onDragEnd={handleLegendDrag}
                        />
                      )}

                      {/* Station boxes */}
                      {boxes.map((box) => {
                        const w = boxWidth(box.stationIds.length);
                        // Pre-compute data for each station in this box
                        const stationData = {};
                        box.stationIds.forEach((sid) => {
                          stationData[sid] = computeStationData(records, sid);
                        });

                        return (
                          <div
                            key={box.id}
                            id={box.id}
                            className="dash-box"
                            style={{
                              position: 'absolute',
                              left: box.position.x,
                              top: box.position.y,
                              width: w,
                            }}
                          >
                            {/* Invisible Xarrow anchor points — mirror the layout editor dot positions */}
                            {box.stationIds.map((sid, i) => (
                              <React.Fragment key={sid}>
                                <div id={`${box.id}__${sid}`}    style={{ position:'absolute', top:0,    left: 17+i*40, width:1, height:1, pointerEvents:'none' }} />
                                <div id={`${box.id}__${sid}__b`} style={{ position:'absolute', bottom:0, left: 17+i*40, width:1, height:1, pointerEvents:'none' }} />
                              </React.Fragment>
                            ))}
                            <div id={`${box.id}__left`}  style={{ position:'absolute', left:0,  top:'50%', width:1, height:1, pointerEvents:'none' }} />
                            <div id={`${box.id}__right`} style={{ position:'absolute', right:0, top:'50%', width:1, height:1, pointerEvents:'none' }} />

                            {/* Header */}
                            <div className="dash-box-header">
                              <span className="dash-box-title">{box.name}</span>
                            </div>
                            {box.description && (
                              <div className="dash-box-desc">{box.description}</div>
                            )}

                            {/* Data grid */}
                            <div className="dash-box-body">
                              <table className="dash-grid">
                                <thead>
                                  <tr>
                                    {box.stationIds.map((sid) => {
                                      const { ze } = stationData[sid];
                                      return (
                                        <th
                                          key={sid}
                                          colSpan={2}
                                          className={`dash-grid-th dash-grid-th--clickable${ze ? ' dash-grid-th--red' : ''}`}
                                          title={`Click to view records for ${sid}`}
                                          onClick={() => setPopupStation(sid)}
                                        >
                                          {sid}
                                        </th>
                                      );
                                    })}
                                  </tr>
                                  {/* Station names row */}
                                  <tr>
                                    {box.stationIds.map((sid, i) => {
                                      const sname = (Array.isArray(box.stationNames) && box.stationNames[i]) || '';
                                      return (
                                        <td
                                          key={`sname-${sid}`}
                                          colSpan={2}
                                          className={`dash-grid-sname${!sname ? ' dash-grid-sname--empty' : ''}`}
                                          title={sname || sid}
                                        >
                                          {sname || '—'}
                                        </td>
                                      );
                                    })}
                                  </tr>
                                </thead>
                                <tbody>
                                  {/* Z / E row */}
                                  <tr>
                                    {box.stationIds.map((sid) => {
                                      const { ze, zeStatus } = stationData[sid];
                                      return (
                                        <td
                                          key={sid}
                                          colSpan={2}
                                          className={`dash-grid-ze${zeStatus ? ` dash-ze--${zeStatus}` : ''}`}
                                        >
                                          {ze || ''}
                                        </td>
                                      );
                                    })}
                                  </tr>

                                  {/* Attribution rows: M, P, D, U */}
                                  {['M', 'P', 'D', 'U'].map((label) => (
                                    <tr key={label}>
                                      {box.stationIds.map((sid) => {
                                        const val = stationData[sid].attrs[label];
                                        return (
                                          <React.Fragment key={sid}>
                                            <td className={`dash-grid-label${val ? ` dash-grid-label--${label.toLowerCase()}` : ''}`}>{val ? label : ''}</td>
                                            <td className={`dash-grid-value${val ? ' dash-grid-value--active' : ''}`}>
                                              {val || ''}
                                            </td>
                                          </React.Fragment>
                                        );
                                      })}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        );
                      })}

                    </div>
                  </TransformComponent>

                  {/* Zoom controls */}
                  <div className="dash-zoom-controls">
                    <button className="dash-zoom-btn" onClick={() => zoomIn()} title="Zoom in"><ZoomIn size={14} /></button>
                    <button className="dash-zoom-btn" onClick={() => zoomOut()} title="Zoom out"><ZoomOut size={14} /></button>
                    <button className="dash-zoom-btn" onClick={() => resetTransform()} title="Reset view"><Maximize2 size={14} /></button>
                  </div>
                </>
              )}
            </TransformWrapper>
          )}
        </div>
      </div>

      {/* Connections: BFS-routed SVG arrows that avoid box obstacles */}
      {(() => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect || connections.length === 0) return null;
        const { left: cl, top: ct } = rect;
        const { scale, positionX, positionY } = transformState;

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
            <path key={conn.id} d={d}
                  stroke="#1a2744" strokeWidth={2} fill="none"
                  markerEnd="url(#dash-arrow-head)" />
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
              <marker id="dash-arrow-head" markerWidth="8" markerHeight="6"
                      refX="7" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill="#1a2744" />
              </marker>
            </defs>
            {arrows}
          </svg>
        );
      })()}

      {/* Station detail popup — rendered outside canvas so it's not clipped */}
      {popupStation && (
        <StationDetailModal
          stationId={popupStation}
          records={records}
          allMonths={allMonths}
          onSaved={handleRecordSaved}
          onClose={() => setPopupStation(null)}
          auditRecords={auditRecords}
          adherenceRecords={adherenceRecords}
          userId={userId}
          layoutId={selectedId}
          onRecordAdded={handleRecordAdded}
          stationIds={boxes.flatMap((b) => b.stationIds)}
        />
      )}
    </Xwrapper>
    <HelpGuide {...DASHBOARD_HELP} active={isActive} />
    </>
  );
}

export default ZStageDashboard;
