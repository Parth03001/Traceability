import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Upload, Database, CheckCircle, AlertCircle, Loader, Plus, X, ClipboardList, CalendarCheck, FileWarning, FileDown, Download } from 'lucide-react';
import { inputApi, layeredAuditApi, layoutApi } from '../../../services/api/layoutApi';
import HelpGuide from '../shared/HelpGuide/HelpGuide';
import './InputData.css';

const INPUT_HELP = {
  title: 'Input Data — Guide',
  sections: [
    {
      heading: 'Tabs Overview',
      items: [
        { icon: '📤', label: 'Upload',           desc: 'Two-step wizard to import Excel data. Step 1: pick the data type. Step 2: drag-and-drop (or browse) your .xlsx file and click Upload.' },
        { icon: '🗄️', label: 'Master Data',       desc: 'View and edit Z-Stage concern records with all fixed columns and monthly incidence counts.' },
        { icon: '📋', label: 'Layered Audit',     desc: 'View and edit layered audit observations per station (NC\'s, action plan, 4M, status, etc.).' },
        { icon: '📅', label: 'Audit Adherence',   desc: 'View and edit stage-wise audit adherence records — stage, auditor, and audit date.' },
        { icon: '📥', label: 'Template',          desc: 'Full-page column reference for all three data types. Each card shows the complete column table inline — scroll to browse all three.' },
      ],
    },
    {
      heading: 'Upload Tab',
      items: [
        { icon: '1️⃣', label: 'Select Data Type',  desc: 'Click one of the three cards on the left — Master Data, Layered Audit, or Audit Adherence — to tell the system which table to update.' },
        { icon: '👁️', label: 'View Template',      desc: 'Each type card has a "View" button that opens a column-reference popup so you can check the expected format without leaving the upload screen.' },
        { icon: '⬇️', label: 'Download Template',  desc: 'Each type card also has a "Download" button to get a blank CSV with the correct headers, a hints row, and an example row.' },
        { icon: '📂', label: 'Choose File',        desc: 'Drag-and-drop your .xlsx file onto the right-side drop zone, or click it to browse. Only Excel files are accepted.' },
        { icon: '✅', label: 'Upload',             desc: 'Click "Upload File" to process. A banner confirms how many rows were imported and lists any skipped rows with the reason.' },
      ],
    },
    {
      heading: 'Master Data Tab',
      items: [
        { icon: '✏️', label: 'Edit a Cell',        desc: 'Click any cell to edit it inline. Constrained fields (Type, RYG, Z/E, Attribution, Attri., Status 3M) show a dropdown. Press Enter to save or Escape to cancel.' },
        { icon: '➕', label: 'Add Record',          desc: 'Click "Add Record" to open a form for a new row. Selecting Attri. auto-fills Attribution; entering Stage No auto-fills Line.' },
        { icon: '🔍', label: 'Filter Columns',     desc: 'Click the filter badge (▾) in any column header to show/hide rows by value. Badge turns blue when a filter is active.' },
        { icon: '📅', label: 'Add New Month',      desc: 'Click "+ Add New Month" to add a monthly incidence column for any year/month not already shown.' },
        { icon: '↻',  label: 'Refresh',            desc: 'Reloads the latest records from the server.' },
      ],
    },
    {
      heading: 'Layered Audit & Adherence Tabs',
      items: [
        { icon: '✏️', label: 'Edit a Cell',        desc: 'Click any cell to edit. Long-text fields (NC\'s, Action Plan) open a resizable text area. Date fields use a date picker.' },
        { icon: '➕', label: 'Add Record',          desc: 'Click "Add Record" to open a form and manually add a new audit or adherence row.' },
        { icon: '🔍', label: 'Filter Columns',     desc: 'Same per-column filter as Master Data — click ▾ in any header to filter by value.' },
        { icon: '↻',  label: 'Refresh',            desc: 'Reloads the latest records from the server.' },
      ],
    },
    {
      heading: 'Template Tab',
      items: [
        { icon: '📖', label: 'Column Reference',   desc: 'All three data types are shown on one scrollable page. Each card lists the exact column names and allowed values / format hints matching the official template.' },
        { icon: '⬇️', label: 'Download Template',  desc: 'Click "Download Template" on any card to get the official .xlsx file with the correct column headers only — ready to fill and upload.' },
      ],
    },
    {
      heading: 'Tips',
      items: [
        { icon: '💡', label: 'Layout Filter',      desc: 'Use the Layout dropdown (top-right of the tabs bar) to scope data to a specific layout. Only records for that layout are shown and saved.' },
        { icon: '⚠️', label: 'Allowed Values',     desc: 'Type (WH/USV), RYG (R/Y/G), Z/E (Z/E), Attribution (M/P/D/U), Status 3M (R/G) must match exactly. Invalid rows are skipped on upload with a reason shown in the result banner.' },
        { icon: '🔄', label: 'Clear a Cell',       desc: 'To remove a value you set earlier, click the cell and clear the text / select the blank option, then press Enter. The field will be saved as empty.' },
      ],
    },
  ],
};

// Fixed options for 4M field
const FOUR_M_OPTIONS = ['MAN', 'MATERIAL', 'METHOD', 'MACHINE'];

// ── Strict allowed values for constrained master columns ─────────────────────
const STRICT_VALUES = {
  type:        ['WH', 'USV'],
  ryg:         ['R', 'Y', 'G'],
  attri:       ['M&M Design', 'M&M process', 'Supplier Design', 'Supplier Process', 'Under Analysis'],
  z_e:         ['Z', 'E'],
  attribution: ['M', 'P', 'D', 'U'],
  status_3m:   ['R', 'G'],
};

// Auto-mapping: selecting Attri. pre-fills Attribution
const ATTRI_TO_ATTRIBUTION = {
  'M&M Design':      'D',
  'M&M process':     'P',
  'Supplier Design': 'D',
  'Supplier Process':'P',
  'Under Analysis':  'U',
};

// Helper: get last N months as 'YYYY-MM' keys
function getLastNMonths(n) {
  const now = new Date();
  const months = [];
  for (let i = 1; i <= n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.unshift(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return months;
}

const MONTHLY_KEYS = [
  '2024-01','2024-02','2024-03','2024-04','2024-05','2024-06',
  '2024-07','2024-08','2024-09','2024-10','2024-11','2024-12',
  '2025-01','2025-02','2025-03','2025-04','2025-05','2025-06',
  '2025-07','2025-08','2025-09','2025-10','2025-11','2025-12',
  '2026-01','2026-02','2026-03',
];

const FIXED_COLUMNS = [
  { key: 'sr_no',          label: 'Sr.No',          width: 60,  type: 'number' },
  { key: 'concern_id',     label: 'Concern ID',      width: 130, type: 'text'   },
  { key: 'concern',        label: 'Concern',         width: 260, type: 'text'   },
  { key: 'type',           label: 'Type',            width: 70,  type: 'text'   },
  { key: 'root_cause',     label: 'Root Cause',      width: 220, type: 'text'   },
  { key: 'action_plan',    label: 'Action Plan',     width: 220, type: 'text'   },
  { key: 'target_date',    label: 'Target Date',     width: 110, type: 'text'   },
  { key: 'closure_date',   label: 'Closure Date',    width: 110, type: 'text'   },
  { key: 'ryg',            label: 'RYG',             width: 60,  type: 'text'   },
  { key: 'attri',          label: 'Attri.',          width: 90,  type: 'text'   },
  { key: 'comm',           label: 'Commodity',       width: 160, type: 'text'   },
  { key: 'line',           label: 'Line',            width: 120, type: 'text'   },
  { key: 'stage_no',       label: 'Stage No',        width: 90,  type: 'text'   },
  { key: 'z_e',            label: 'Z/E',             width: 55,  type: 'text'   },
  { key: 'attribution',    label: 'Attribution',     width: 90,  type: 'text'   },
  { key: 'part',           label: 'Part',            width: 160, type: 'text'   },
  { key: 'phenomena',      label: 'Phenomena',       width: 160, type: 'text'   },
  { key: 'total_incidences', label: 'Total',         width: 70,  type: 'number' },
];

const TRAILING_COLUMNS = [
  { key: 'field_defect_after_cutoff', label: 'Field Defect After Cut-off', width: 130, type: 'number' },
  { key: 'status_3m',                 label: 'Status (3M)',                 width: 90,  type: 'text'   },
];

// ── Template definitions — column names match the senior's xlsx templates exactly
// All months Jan-24 → Mar-26 as they appear in the actual template header row
const ALL_TEMPLATE_MONTHS = [
  'Jan-24','Feb-24','Mar-24','Apr-24','May-24','Jun-24',
  'Jul-24','Aug-24','Sep-24','Oct-24','Nov-24','Dec-24',
  'Jan-25','Feb-25','Mar-25','Apr-25','May-25','Jun-25',
  'Jul-25','Aug-25','Sep-25','Oct-25','Nov-25','Dec-25',
  'Jan-26','Feb-26','Mar-26',
];

const TEMPLATE_DEFS = {
  master: {
    label: 'Master Data',
    filename: 'master_data_template.xlsx',
    desc: 'Z-Stage concern tracking. Fill in rows below the header and upload via the Upload tab.',
    columns: [
      { name: 'Sr.No',                      hint: 'Sequential number',                                                         },
      { name: 'Concern ID',                  hint: 'Unique concern identifier',                                                 },
      { name: 'Concern',                     hint: 'Description of the concern',                                                },
      { name: 'Type',                        hint: 'WH  |  USV',                                                                },
      { name: 'Root Cause',                  hint: 'Root cause analysis',                                                       },
      { name: 'Action Plan',                 hint: 'Corrective action taken / planned',                                         },
      { name: 'Target Date',                 hint: 'YYYY-MM-DD',                                                                },
      { name: 'Closure Date',                hint: 'YYYY-MM-DD',                                                                },
      { name: 'RYG',                         hint: 'R  |  Y  |  G',                                                             },
      { name: 'Attri.',                      hint: 'M&M Design  |  M&M process  |  Supplier Design  |  Supplier Process  |  Under Analysis' },
      { name: 'Comm',                        hint: 'Commodity / material name',                                                 },
      { name: 'Line',                        hint: 'Production line prefix (e.g. T1)',                                          },
      { name: 'Stage No',                    hint: 'Station ID (e.g. T1-01)',                                                   },
      { name: 'Z/E',                         hint: 'Z  |  E',                                                                   },
      { name: 'ATTRIBUTION',                 hint: 'M  |  P  |  D  |  U',                                                      },
      { name: 'Part',                        hint: 'Part name or number',                                                       },
      { name: 'Phenomena',                   hint: 'Phenomena / symptom description',                                           },
      { name: 'Total Incidenes',             hint: 'Total incidences count (auto-sum of monthly columns)',                      },
      ...ALL_TEMPLATE_MONTHS.map((m) => ({ name: m, hint: `Monthly incidence count for ${m}` })),
      { name: 'Field defect after cut off',  hint: 'Number of field defects after cut-off date',                                },
      { name: 'Status (3 Month basis)',      hint: 'R  |  G',                                                                   },
    ],
  },
  'layered-audit': {
    label: 'Layered Audit',
    filename: 'layered_audit_template.xlsx',
    desc: 'Layered audit observation records. One row per audit observation.',
    columns: [
      { name: 'Model',          hint: 'Vehicle model name'                      },
      { name: 'Sr.No',          hint: 'Unique serial / reference number'        },
      { name: 'Date',           hint: 'YYYY-MM-DD'                              },
      { name: 'Station ID',     hint: 'Station / stage identifier'              },
      { name: 'Workstation',    hint: 'Workstation name or code'                },
      { name: 'Auditor',        hint: 'Name of the auditor'                     },
      { name: "NC's",           hint: 'Non-conformance observed'                },
      { name: 'Action Plan',    hint: 'Corrective action taken / planned'       },
      { name: '4M',             hint: 'MAN  |  MATERIAL  |  METHOD  |  MACHINE' },
      { name: 'Responsibility', hint: 'Responsible person or department'        },
      { name: 'Target Date',    hint: 'YYYY-MM-DD'                              },
      { name: 'Status',         hint: 'Open / Closed / In Progress'             },
    ],
  },
  'audit-adherence': {
    label: 'Audit Adherence',
    filename: 'audit_adherence_template.xlsx',
    desc: 'Audit adherence tracking per stage. One row per audit entry.',
    columns: [
      { name: 'Stage No',   hint: 'Station / stage identifier' },
      { name: 'Stage Name', hint: 'Name of the stage'          },
      { name: 'Auditor',    hint: 'Name of the auditor'        },
      { name: 'Audit Date', hint: 'YYYY-MM-DD'                 },
    ],
  },
};

// ── Template download — serve pre-built xlsx files from /public/templates/ ───

// Maps each template key → the static xlsx file name in /public/templates/
const TEMPLATE_FILES = {
  'master':          'master_data_template.xlsx',
  'layered-audit':   'layered_audit_template.xlsx',
  'audit-adherence': 'audit_adherence_template.xlsx',
};

// Trigger a browser download of the static xlsx template
function downloadTemplate(key) {
  const filename = TEMPLATE_FILES[key];
  if (!filename) return;
  const a = document.createElement('a');
  a.href = `${process.env.PUBLIC_URL}/templates/${filename}`;
  a.download = filename;
  a.click();
}

function formatMonthLabel(key) {
  const [year, month] = key.split('-');
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleString('default', { month: 'short' }) + ' ' + year.slice(2);
}

function RYGBadge({ value }) {
  if (!value) return <span>—</span>;
  const cls = value === 'G' ? 'ryg-g' : value === 'R' ? 'ryg-r' : value === 'Y' ? 'ryg-y' : '';
  return <span className={`ryg-badge ${cls}`}>{value}</span>;
}

// Long-text fields that always use a <textarea> when editing
const LONG_TEXT_FIELDS = new Set(['concern', 'root_cause', 'action_plan', 'comm', 'ncs']);

// saveFn defaults to the master-data API; pass a different fn for audit tables
function EditableCell({ recordId, fieldKey, value, type, options, onSaved, saveFn }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { setDraft(value ?? ''); }, [value]);
  useEffect(() => { if (editing && inputRef.current) inputRef.current.focus(); }, [editing]);

  const commit = useCallback(async (overrideVal) => {
    setEditing(false);
    const raw = overrideVal !== undefined ? overrideVal : draft;
    const trimmed = typeof raw === 'string' ? raw.trim() : '';
    const original = String(value ?? '');
    if (trimmed === original) return;

    setSaving(true);
    try {
      let fieldValue;
      if (type === 'number') {
        fieldValue = trimmed === '' ? null : Number(trimmed);
      } else {
        fieldValue = trimmed || null;
      }
      const payload = { [fieldKey]: fieldValue };
      const fn = saveFn || inputApi.updateRecord;
      const res = await fn(recordId, payload);
      onSaved(recordId, res.data);
    } catch (err) {
      console.error('Save failed', err);
      setDraft(value ?? '');
    } finally {
      setSaving(false);
    }
  }, [draft, value, fieldKey, type, recordId, onSaved, saveFn]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') commit();
    if (e.key === 'Escape') { setDraft(value ?? ''); setEditing(false); }
  };

  if (saving) return <td className="cell-saving"><Loader size={12} className="spin" /></td>;

  if (editing) {
    const isLong = LONG_TEXT_FIELDS.has(fieldKey) || type === 'longtext';
    return (
      <td className="cell-editing">
        {isLong ? (
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === 'Escape') { setDraft(value ?? ''); setEditing(false); } }}
            rows={3}
            className="cell-textarea"
          />
        ) : type === 'select' ? (
          <select
            ref={inputRef}
            value={draft}
            onChange={(e) => { const v = e.target.value; setDraft(v); commit(v); }}
            onBlur={() => setEditing(false)}
            className="cell-input cell-select"
          >
            <option value="">— select —</option>
            {(options || []).map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        ) : type === 'date' ? (
          <input
            ref={inputRef}
            type="date"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={handleKeyDown}
            className="cell-input"
          />
        ) : (
          <input
            ref={inputRef}
            type={type === 'number' ? 'number' : 'text'}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={handleKeyDown}
            className="cell-input"
          />
        )}
      </td>
    );
  }

  const display = value ?? '';
  const isEmpty = display === '' || display === null || display === undefined;

  return (
    <td className="cell-view" onClick={() => setEditing(true)} title="Click to edit">
      {isEmpty ? <span className="cell-empty">—</span> : <span>{String(display)}</span>}
    </td>
  );
}

function MonthlyCell({ recordId, monthKey, monthlyData, onSaved }) {
  const parsed = monthlyData ? (() => { try { return JSON.parse(monthlyData); } catch { return {}; } })() : {};
  const value = parsed[monthKey] ?? null;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value !== null ? String(value) : '');
  const [saving, setSaving] = useState(false);
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
      if (newVal === null) {
        delete newParsed[monthKey];
      } else {
        newParsed[monthKey] = newVal;
      }
      const newTotal = Object.values(newParsed).reduce((sum, v) => sum + v, 0);
      const res = await inputApi.updateRecord(recordId, {
        monthly_data: JSON.stringify(newParsed),
        total_incidences: newTotal,
      });
      onSaved(recordId, res.data);
    } catch (err) {
      console.error('Save failed', err);
      setDraft(value !== null ? String(value) : '');
    } finally {
      setSaving(false);
    }
  }, [draft, value, parsed, monthKey, recordId, onSaved]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') commit();
    if (e.key === 'Escape') { setDraft(value !== null ? String(value) : ''); setEditing(false); }
  };

  if (saving) return <td className="cell-saving monthly-cell"><Loader size={12} className="spin" /></td>;

  if (editing) {
    return (
      <td className="cell-editing monthly-cell">
        <input
          ref={inputRef}
          type="number"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={handleKeyDown}
          className="cell-input"
        />
      </td>
    );
  }

  return (
    <td
      className={`cell-view monthly-cell ${value !== null ? 'has-value' : ''}`}
      onClick={() => setEditing(true)}
      title="Click to edit"
    >
      {value !== null ? value : ''}
    </td>
  );
}

// ── Layered Audit column definitions ─────────────────────────────────────────

const LAYERED_AUDIT_COLUMNS = [
  { key: 'model',          label: 'Model',          width: 120, type: 'text'     },
  { key: 'sr_no',          label: 'Sr.No',          width: 200, type: 'text'     },
  { key: 'date_col',       label: 'Date',           width: 120, type: 'date'     },
  { key: 'station_id',     label: 'Station ID',     width: 110, type: 'text'     },
  { key: 'workstation',    label: 'Workstation',    width: 180, type: 'text'     },
  { key: 'auditor',        label: 'Auditor',        width: 200, type: 'text'     },
  { key: 'ncs',            label: "NC's",           width: 280, type: 'longtext' },
  { key: 'action_plan',    label: 'Action Plan',    width: 280, type: 'longtext' },
  { key: 'four_m',         label: '4M',             width: 120, type: 'select',  options: FOUR_M_OPTIONS },
  { key: 'responsibility', label: 'Responsibility', width: 160, type: 'text'     },
  { key: 'target_date',    label: 'Target Date',    width: 120, type: 'date'     },
  { key: 'status',         label: 'Status',         width: 90,  type: 'text'     },
];

const LAYERED_ADHERENCE_COLUMNS = [
  { key: 'stage_no',   label: 'Stage No',   width: 110, type: 'text' },
  { key: 'stage_name', label: 'Stage Name', width: 220, type: 'text' },
  { key: 'auditor',    label: 'Auditor',    width: 200, type: 'text' },
  { key: 'audit_date', label: 'Audit Date', width: 120, type: 'date' },
];

// ── Column filter dropdown ─────────────────────────────────────────────────────
// selectedValues: null = no filter (all shown) | string[] = only these values shown
function ColumnFilterDropdown({ colKey, allValues, selectedValues, onChange }) {
  const [open, setOpen]       = useState(false);
  const [dropPos, setDropPos] = useState({ top: 0, left: 0 });
  const btnRef  = useRef(null);
  const dropRef = useRef(null);

  // Close when clicking outside
  useEffect(() => {
    if (!open) return;
    const h = (e) => {
      if (!btnRef.current?.contains(e.target) && !dropRef.current?.contains(e.target))
        setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const handleToggle = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setDropPos({ top: r.bottom + 2, left: r.left });
    }
    setOpen((o) => !o);
  };

  const isFiltered       = selectedValues !== null;
  const effectiveSelected = selectedValues ?? allValues;
  const noneChecked      = isFiltered && selectedValues.length === 0;

  const toggle = (val) => {
    const current = selectedValues !== null ? [...selectedValues] : [...allValues];
    const next = current.includes(val)
      ? current.filter((v) => v !== val)
      : [...current, val];
    // Back to "no filter" when everything is re-selected
    onChange(colKey, next.length === allValues.length ? null : next);
  };

  const btnLabel = noneChecked
    ? '0'
    : isFiltered
      ? `${effectiveSelected.length}/${allValues.length}`
      : '▾';

  return (
    <>
      <button
        ref={btnRef}
        className={`col-filter-btn${isFiltered ? ' col-filter-btn--active' : ''}`}
        onClick={handleToggle}
        title="Filter column values"
      >
        {btnLabel}
      </button>

      {open && createPortal(
        <div
          ref={dropRef}
          className="col-filter-dropdown"
          style={{ position: 'fixed', top: dropPos.top, left: dropPos.left, zIndex: 9999 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="col-filter-actions">
            <button className="col-filter-action-btn" onClick={() => onChange(colKey, null)}>
              Select All
            </button>
            <button className="col-filter-action-btn col-filter-action-btn--deselect"
                    onClick={() => onChange(colKey, [])}>
              Deselect All
            </button>
          </div>
          <div className="col-filter-list">
            {allValues.length === 0 && <div className="col-filter-empty">No values</div>}
            {allValues.map((val, i) => (
              <label key={i} className="col-filter-item">
                <input
                  type="checkbox"
                  checked={effectiveSelected.includes(val)}
                  onChange={() => toggle(val)}
                />
                <span className="col-filter-val" title={val}>
                  {val !== '' ? val : <em className="col-filter-blank">(blank)</em>}
                </span>
              </label>
            ))}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

// ── Editable table with per-column dropdown filters ───────────────────────────
// saveFn(id, payload) → Promise<{data: updatedRecord}>
// onSaved(recordId, updatedRecord) — called on successful save
function AuditTable({ columns, records, saveFn, onSaved }) {
  // filters: { [colKey]: null | string[] }  null = no filter (all shown)
  const [filters, setFilters] = useState({});

  // Unique sorted values per column, derived from all records
  const uniqueValues = React.useMemo(() => {
    const map = {};
    columns.forEach((col) => {
      map[col.key] = [
        ...new Set(records.map((r) => String(r[col.key] ?? '')))
      ].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    });
    return map;
  }, [records, columns]);

  const handleFilterChange = useCallback((key, val) => {
    setFilters((prev) => ({ ...prev, [key]: val }));
  }, []);

  const filteredRecords = React.useMemo(() =>
    records.filter((rec) =>
      columns.every((col) => {
        const f = filters[col.key];
        if (f == null) return true;
        return f.includes(String(rec[col.key] ?? ''));
      })
    ),
    [records, filters, columns]
  );

  if (records.length === 0) return null;

  return (
    <div className="table-wrapper">
      <table className="master-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} style={{ minWidth: col.width }}>
                <div className="col-header-wrap">
                  <span className="col-header-label">{col.label}</span>
                  <ColumnFilterDropdown
                    colKey={col.key}
                    allValues={uniqueValues[col.key] || []}
                    selectedValues={filters[col.key] ?? null}
                    onChange={handleFilterChange}
                  />
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filteredRecords.map((rec) => (
            <tr key={rec.id}>
              {columns.map((col) => (
                <EditableCell
                  key={col.key}
                  recordId={rec.id}
                  fieldKey={col.key}
                  value={rec[col.key]}
                  type={col.type || 'text'}
                  options={col.options}
                  onSaved={onSaved}
                  saveFn={saveFn}
                />
              ))}
            </tr>
          ))}
          {filteredRecords.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="filter-no-results">
                No records match the current filter.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ── Reusable audit upload + view panel ────────────────────────────────────────
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const LS_KEY = 'zstage_extra_months';

function AddMonthModal({ existingMonths, onAdd, onClose }) {
  const [month, setMonth] = useState(String(new Date().getMonth() + 1).padStart(2, '0'));
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [error, setError] = useState('');

  const handleAdd = () => {
    const yr = parseInt(year, 10);
    if (!yr || yr < 2000 || yr > 2100) { setError('Enter a valid year (2000–2100).'); return; }
    const key = `${yr}-${month}`;
    if (existingMonths.includes(key)) { setError(`${formatMonthLabel(key)} already exists.`); return; }
    onAdd(key);
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="add-month-modal">
        <div className="modal-header">
          <span className="modal-title">Add New Month</span>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body">
          <label className="modal-label">Month</label>
          <select className="modal-select" value={month} onChange={(e) => setMonth(e.target.value)}>
            {MONTH_NAMES.map((name, i) => (
              <option key={i} value={String(i + 1).padStart(2, '0')}>{name}</option>
            ))}
          </select>
          <label className="modal-label" style={{ marginTop: 12 }}>Year</label>
          <input
            className="modal-input"
            type="number"
            value={year}
            onChange={(e) => { setYear(e.target.value); setError(''); }}
            min="2000"
            max="2100"
          />
          {error && <p className="modal-error">{error}</p>}
        </div>
        <div className="modal-footer">
          <button className="modal-cancel" onClick={onClose}>Cancel</button>
          <button className="modal-confirm" onClick={handleAdd}>Add Column</button>
        </div>
      </div>
    </div>
  );
}

// ── Add Record Modal for InputData ──────────────────────────────────────────
function AddRecordModal({ type, onClose, onSaved, userId, layoutId, layoutStageIds = [] }) {
  // current month + last 3 months (4 total, oldest first)
  const formMonths = React.useMemo(() => {
    const now = new Date();
    const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const months = [];
    for (let i = 3; i >= 1; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    months.push(currentKey);
    return months;
  }, []);

  const defaultMaster = () => {
    const m = {};
    formMonths.forEach((k) => { m[k] = ''; });
    return {
      concern_id: '', concern: '', type: '', root_cause: '', action_plan: '',
      target_date: '', closure_date: '', ryg: '', attri: '', comm: '', line: '',
      stage_no: '', z_e: '', attribution: '', part: '', phenomena: '',
      status_3m: '', monthly: m,
    };
  };
  const defaultAudit = () => ({
    model: '', date_col: '', station_id: '',
    workstation: '', auditor: '', ncs: '', action_plan: '',
    four_m: '', responsibility: '', target_date: '', status: '',
  });
  const defaultAdherence = () => ({
    stage_no: '', stage_name: '', auditor: '', audit_date: '',
  });

  const [form, setForm] = useState(
    type === 'master' ? defaultMaster() :
    type === 'layered-audit' ? defaultAudit() :
    defaultAdherence()
  );
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const set = (key, val) => setForm((p) => ({ ...p, [key]: val }));
  const setMonthly = (key, val) => setForm((p) => ({ ...p, monthly: { ...p.monthly, [key]: val } }));

  // Auto-map Attri. → Attribution in a single state update
  const handleAttriChange = (val) => {
    const mapped = ATTRI_TO_ATTRIBUTION[val];
    setForm((p) => ({ ...p, attri: val, ...(mapped ? { attribution: mapped } : {}) }));
  };

  // Auto-map Stage No → Line (extract prefix before first '-', e.g. T1-01 → T1)
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
          concern_id: form.concern_id || null, concern: form.concern || null,
          type: form.type || null, root_cause: form.root_cause || null,
          action_plan: form.action_plan || null, target_date: form.target_date || null,
          closure_date: form.closure_date || null, ryg: form.ryg || null,
          attri: form.attri || null, comm: form.comm || null, line: form.line || null,
          stage_no: form.stage_no || null, z_e: form.z_e || null,
          attribution: form.attribution || null, part: form.part || null,
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
    <select className="modal-select" value={form[key] || ''} onChange={(e) => set(key, e.target.value)}>
      <option value="">— select —</option>
      {opts.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
  const inp = (key, t = 'text') => (
    <input className="modal-input" type={t} value={form[key] || ''} onChange={(e) => set(key, e.target.value)} />
  );
  const ta = (key) => (
    <textarea className="modal-textarea" rows={2} value={form[key] || ''} onChange={(e) => set(key, e.target.value)} />
  );

  return createPortal(
    <div className="modal-overlay">
      <div className="add-record-modal">
        <div className="modal-header">
          <span className="modal-title">Add Record — {
            type === 'master' ? 'Master Data' :
            type === 'layered-audit' ? 'Layered Audit' : 'Audit Adherence'
          }</span>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body modal-body--form">
          {type === 'master' && (
            <div className="modal-form-grid">
              <label>Concern ID{inp('concern_id')}</label>
              <label className="modal-form-full">Concern{ta('concern')}</label>
              <label>Type {sel('type', STRICT_VALUES.type)}</label>
              <label>RYG {sel('ryg', STRICT_VALUES.ryg)}</label>
              <label>Z/E {sel('z_e', STRICT_VALUES.z_e)}</label>
              <label>Attribution {sel('attribution', STRICT_VALUES.attribution)}</label>
              <label>Attri.
                <select className="modal-select" value={form.attri || ''} onChange={(e) => handleAttriChange(e.target.value)}>
                  <option value="">— select —</option>
                  {STRICT_VALUES.attri.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </label>
              <label>Status (3M) {sel('status_3m', STRICT_VALUES.status_3m)}</label>
              <label>Stage No
                {layoutStageIds.length > 0
                  ? <select className="modal-select" value={form.stage_no || ''} onChange={(e) => handleStageChange(e.target.value)}>
                      <option value="">— select —</option>
                      {layoutStageIds.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  : <input className="modal-input" type="text" value={form.stage_no || ''} onChange={(e) => handleStageChange(e.target.value)} />
                }
              </label>
              <label>Line{inp('line')}</label>
              <label>Part{inp('part')}</label>
              <label>Phenomena{inp('phenomena')}</label>
              <label>Target Date{inp('target_date')}</label>
              <label>Closure Date{inp('closure_date')}</label>
              <label className="modal-form-full">Root Cause{ta('root_cause')}</label>
              <label className="modal-form-full">Action Plan{ta('action_plan')}</label>
              <label className="modal-form-full">Commodity{ta('comm')}</label>
              <div className="modal-form-full">
                <div className="modal-form-section-title">Monthly Incidences (current + last 3 months)</div>
                <div className="modal-form-months">
                  {formMonths.map((k) => (
                    <label key={k}>{formatMonthLabel(k)}
                      <input
                        className="modal-input modal-input--month"
                        type="number" min="0"
                        value={form.monthly[k] || ''}
                        onChange={(e) => setMonthly(k, e.target.value)}
                      />
                    </label>
                  ))}
                </div>
                <p className="modal-form-note">
                  ℹ️ To add records for more months, use the Excel upload. Same format as download.
                </p>
              </div>
            </div>
          )}
          {type === 'layered-audit' && (
            <div className="modal-form-grid">
              <label>Model{inp('model')}</label>
              <label>Date{inp('date_col', 'date')}</label>
              <label>Station ID
                {layoutStageIds.length > 0
                  ? sel('station_id', layoutStageIds)
                  : inp('station_id')}
              </label>
              <label>Workstation{inp('workstation')}</label>
              <label>Auditor{inp('auditor')}</label>
              <label className="modal-form-full">NC's{ta('ncs')}</label>
              <label className="modal-form-full">Action Plan{ta('action_plan')}</label>
              <label>4M {sel('four_m', FOUR_M_OPTIONS)}</label>
              <label>Responsibility{inp('responsibility')}</label>
              <label>Target Date{inp('target_date', 'date')}</label>
              <label>Status{inp('status')}</label>
            </div>
          )}
          {type === 'audit-adherence' && (
            <div className="modal-form-grid">
              <label>Stage No
                {layoutStageIds.length > 0
                  ? sel('stage_no', layoutStageIds)
                  : inp('stage_no')}
              </label>
              <label>Stage Name{inp('stage_name')}</label>
              <label>Auditor{inp('auditor')}</label>
              <label>Audit Date{inp('audit_date', 'date')}</label>
            </div>
          )}
          {error && (
            <div className="modal-error-bar">
              <AlertCircle size={14} /> {error}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="modal-cancel" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="modal-confirm" onClick={handleSave} disabled={saving}>
            {saving ? <><Loader size={13} className="spin" /> Saving…</> : 'Save Record'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// Upload data-type options
const UPLOAD_TYPES = [
  { value: 'master',          label: 'Master Data',      desc: 'Concern records & monthly incidences', viewTab: 'master'          },
  { value: 'layered-audit',   label: 'Layered Audit',    desc: 'Audit observations per station',       viewTab: 'layered-audit'   },
  { value: 'audit-adherence', label: 'Audit Adherence',  desc: 'Stage-wise adherence per auditor',     viewTab: 'audit-adherence' },
];

export default function InputData({ userId, layouts = [] }) {
  const [activeTab, setActiveTab] = useState('upload');
  // upload tab state
  const [uploadType, setUploadType] = useState('master');
  const [dragging, setDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const fileInputRef = useRef(null);

  // shared layout selector
  const [selectedLayoutId, setSelectedLayoutId] = useState(null);

  // Master Data state
  const [records, setRecords] = useState([]);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [extraMonths, setExtraMonths] = useState(() => {
    try { return JSON.parse(localStorage.getItem(LS_KEY)) || []; } catch { return []; }
  });
  const [showAddMonth, setShowAddMonth] = useState(false);

  // Layered Audit state
  const [auditRecords, setAuditRecords] = useState([]);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [auditError, setAuditError] = useState(null);

  // Audit Adherence state
  const [adherenceRecords, setAdherenceRecords] = useState([]);
  const [loadingAdherence, setLoadingAdherence] = useState(false);
  const [adherenceError, setAdherenceError] = useState(null);

  // Master Data column filters — { [colKey]: null | string[] }
  const [masterFilters, setMasterFilters] = useState({});
  const handleMasterFilterChange = useCallback((key, val) => {
    setMasterFilters((prev) => ({ ...prev, [key]: val }));
  }, []);

  // Template preview modal — null means closed, otherwise the key ('master' | 'layered-audit' | 'audit-adherence')
  const [templatePreviewModal, setTemplatePreviewModal] = useState(null);

  // Add Record modal state
  const [showAddRecord, setShowAddRecord] = useState(null); // null | 'master' | 'layered-audit' | 'audit-adherence'

  // Stage IDs from the selected layout's station boxes (for Stage No filter)
  const [layoutStageIds, setLayoutStageIds] = useState([]);
  useEffect(() => {
    if (!selectedLayoutId) return;
    layoutApi.getLayout(selectedLayoutId)
      .then((res) => {
        const boxes = res.data?.station_boxes || [];
        const ids = [];
        boxes.forEach((b) => {
          const sids = b.station_ids
            ? (typeof b.station_ids === 'string' ? b.station_ids.split(',') : b.station_ids)
            : [];
          sids.forEach((s) => { if (s && !ids.includes(s)) ids.push(s); });
        });
        setLayoutStageIds(ids.sort());
      })
      .catch(() => setLayoutStageIds([]));
  }, [selectedLayoutId]);

  // Auto-select first layout
  useEffect(() => {
    if (layouts.length > 0 && selectedLayoutId === null) {
      setSelectedLayoutId(layouts[0].id);
    }
  }, [layouts, selectedLayoutId]);

  // ── Master Data load ────────────────────────────────────────────────────────
  const loadRecords = useCallback(async () => {
    setLoadingRecords(true);
    setLoadError(null);
    try {
      const res = await inputApi.getRecords(userId, selectedLayoutId);
      setRecords(Array.isArray(res.data) ? res.data : []);
    } catch {
      setLoadError('Failed to load records. Is the backend running?');
    } finally {
      setLoadingRecords(false);
    }
  }, [userId, selectedLayoutId]);

  useEffect(() => {
    if (activeTab === 'master') loadRecords();
  }, [activeTab, loadRecords]);

  // ── Layered Audit load ──────────────────────────────────────────────────────
  const loadAuditRecords = useCallback(async () => {
    setLoadingAudit(true);
    setAuditError(null);
    try {
      const res = await layeredAuditApi.getAuditRecords(userId, selectedLayoutId);
      setAuditRecords(Array.isArray(res.data) ? res.data : []);
    } catch {
      setAuditError('Failed to load records. Is the backend running?');
    } finally {
      setLoadingAudit(false);
    }
  }, [userId, selectedLayoutId]);

  useEffect(() => {
    if (activeTab === 'layered-audit') loadAuditRecords();
  }, [activeTab, loadAuditRecords]);

  // ── Audit Adherence load ────────────────────────────────────────────────────
  const loadAdherenceRecords = useCallback(async () => {
    setLoadingAdherence(true);
    setAdherenceError(null);
    try {
      const res = await layeredAuditApi.getAdherenceRecords(userId, selectedLayoutId);
      setAdherenceRecords(Array.isArray(res.data) ? res.data : []);
    } catch {
      setAdherenceError('Failed to load records. Is the backend running?');
    } finally {
      setLoadingAdherence(false);
    }
  }, [userId, selectedLayoutId]);

  useEffect(() => {
    if (activeTab === 'audit-adherence') loadAdherenceRecords();
  }, [activeTab, loadAdherenceRecords]);

  const handleRecordSaved = useCallback((recordId, updatedRecord) => {
    setRecords((prev) => prev.map((r) => (r.id === recordId ? updatedRecord : r)));
  }, []);

  const handleAuditRecordSaved = useCallback((recordId, updatedRecord) => {
    setAuditRecords((prev) => prev.map((r) => (r.id === recordId ? updatedRecord : r)));
  }, []);

  const handleAdherenceRecordSaved = useCallback((recordId, updatedRecord) => {
    setAdherenceRecords((prev) => prev.map((r) => (r.id === recordId ? updatedRecord : r)));
  }, []);

  const handleRecordAdded = useCallback((tabType, newRec) => {
    if (tabType === 'master') setRecords((p) => [...p, newRec]);
    else if (tabType === 'layered-audit') setAuditRecords((p) => [...p, newRec]);
    else if (tabType === 'audit-adherence') setAdherenceRecords((p) => [...p, newRec]);
  }, []);

  const allMonths = React.useMemo(() => {
    const set = new Set(MONTHLY_KEYS);
    records.forEach((rec) => {
      if (rec.monthly_data) {
        try { Object.keys(JSON.parse(rec.monthly_data)).forEach((k) => set.add(k)); } catch {}
      }
    });
    extraMonths.forEach((k) => set.add(k));
    return Array.from(set).sort();
  }, [records, extraMonths]);

  const masterUniqueValues = React.useMemo(() => {
    const allCols = [...FIXED_COLUMNS, ...TRAILING_COLUMNS];
    const map = {};
    allCols.forEach((col) => {
      if (STRICT_VALUES[col.key]) {
        // Use only allowed values for constrained columns — always show fixed options
        map[col.key] = STRICT_VALUES[col.key];
      } else if (col.key === 'stage_no' && layoutStageIds.length > 0) {
        // Stage No: only show stage IDs that exist in the current layout's station boxes
        map[col.key] = layoutStageIds;
      } else {
        map[col.key] = [
          ...new Set(records.map((r) => String(r[col.key] ?? '')))
        ].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      }
    });
    return map;
  }, [records, layoutStageIds]);

  const filteredMasterRecords = React.useMemo(() => {
    const allCols = [...FIXED_COLUMNS, ...TRAILING_COLUMNS];
    return records.filter((rec) =>
      allCols.every((col) => {
        const f = masterFilters[col.key]; // null | string[]
        if (f == null) return true;
        return f.includes(String(rec[col.key] ?? ''));
      })
    );
  }, [records, masterFilters]);

  const handleAddMonth = (key) => {
    const updated = [...extraMonths, key];
    setExtraMonths(updated);
    localStorage.setItem(LS_KEY, JSON.stringify(updated));
  };

  // ── Upload handler (all types) ──────────────────────────────────────────────
  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    setUploadResult(null);
    try {
      let res;
      if (uploadType === 'master') {
        res = await inputApi.uploadExcel(selectedFile, userId, selectedLayoutId);
      } else if (uploadType === 'layered-audit') {
        res = await layeredAuditApi.uploadAudit(selectedFile, userId, selectedLayoutId);
      } else {
        res = await layeredAuditApi.uploadAdherence(selectedFile, userId, selectedLayoutId);
      }
      const viewTab = UPLOAD_TYPES.find((t) => t.value === uploadType)?.viewTab || 'master';
      setUploadResult({
        success: true,
        message: res.data.message,
        rowsImported: res.data.rows_imported,
        skippedRows: res.data.skipped_rows || null,
        viewTab,
      });
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      const detail = err.response?.data?.detail || 'Upload failed. Check the file and try again.';
      setUploadResult({ success: false, message: detail });
    } finally {
      setUploading(false);
    }
  };

  // Layout dropdown shared across all tabs
  const layoutDropdown = layouts.length > 0 && (
    <div className="tabs-layout-select">
      <label className="layout-select-label">Layout:</label>
      <select
        className="layout-select-dropdown"
        value={selectedLayoutId ?? ''}
        onChange={(e) => setSelectedLayoutId(e.target.value ? Number(e.target.value) : null)}
      >
        {layouts.map((l) => (
          <option key={l.id} value={l.id}>{l.name}</option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="input-data">
      <div className="input-tabs">
        <button
          className={`input-tab ${activeTab === 'upload' ? 'active' : ''}`}
          onClick={() => setActiveTab('upload')}
        >
          <Upload size={15} />
          Upload
        </button>
        <button
          className={`input-tab ${activeTab === 'master' ? 'active' : ''}`}
          onClick={() => setActiveTab('master')}
        >
          <Database size={15} />
          Master Data
        </button>
        <button
          className={`input-tab ${activeTab === 'layered-audit' ? 'active' : ''}`}
          onClick={() => setActiveTab('layered-audit')}
        >
          <ClipboardList size={15} />
          Layered Audit
        </button>
        <button
          className={`input-tab ${activeTab === 'audit-adherence' ? 'active' : ''}`}
          onClick={() => setActiveTab('audit-adherence')}
        >
          <CalendarCheck size={15} />
          Audit Adherence
        </button>
        <button
          className={`input-tab ${activeTab === 'template' ? 'active' : ''}`}
          onClick={() => setActiveTab('template')}
        >
          <FileDown size={15} />
          Template
        </button>
        {layoutDropdown}
      </div>

      {/* ── Upload tab ──────────────────────────────────────────────────────── */}
      {activeTab === 'upload' && (
        <div className="upload-panel">

          {/* Two-column layout: Step 1 (left) | Step 2 (right) */}
          <div className="upload-columns">

            {/* ── Step 1: Select data type ──────────────────────────────────── */}
            <div className="upload-col upload-col--left">
              <div className="upload-step-heading">
                <span className="upload-step-badge">1</span>
                <span className="upload-step-title">Select Data Type</span>
              </div>

              <div className="upload-type-options">
                {UPLOAD_TYPES.map((t) => (
                  <div key={t.value} className="upload-type-card-wrap">
                    <div
                      className={`upload-type-option ${uploadType === t.value ? 'selected' : ''}`}
                      onClick={() => { setUploadType(t.value); setSelectedFile(null); setUploadResult(null); }}
                    >
                      <input type="radio" name="uploadType" value={t.value}
                        checked={uploadType === t.value} onChange={() => {}} style={{ display: 'none' }} />

                      <span className={`upload-type-dot${uploadType === t.value ? ' upload-type-dot--on' : ''}`} />

                      <div className="upload-type-body">
                        <span className="upload-type-name">{t.label}</span>
                        <span className="upload-type-desc">{t.desc}</span>
                      </div>

                      <div className="upload-type-btns">
                        <button
                          className="upload-type-template-btn upload-type-template-btn--view"
                          title="Preview column reference in a popup"
                          onClick={(e) => { e.stopPropagation(); setTemplatePreviewModal(t.value); }}
                        >
                          <FileDown size={12} /> View
                        </button>
                        <button
                          className="upload-type-template-btn"
                          title="Download blank template CSV"
                          onClick={(e) => { e.stopPropagation(); downloadTemplate(t.value); }}
                        >
                          <Download size={12} /> Download
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Step 2: Upload file ───────────────────────────────────────── */}
            <div className="upload-col upload-col--right">
              <div className="upload-step-heading">
                <span className="upload-step-badge">2</span>
                <span className="upload-step-title">Upload File</span>
              </div>

              <div
                className={`drop-zone ${dragging ? 'drag-over' : ''} ${selectedFile ? 'has-file' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) setSelectedFile(f); }}
                onClick={() => fileInputRef.current?.click()}
              >
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls"
                  className="file-input-hidden"
                  onChange={(e) => { const f = e.target.files[0]; if (f) setSelectedFile(f); }} />
                <Upload size={40} strokeWidth={1.3} className="drop-icon" />
                {selectedFile ? (
                  <>
                    <p className="drop-filename">{selectedFile.name}</p>
                    <p className="drop-hint">Click to choose a different file</p>
                  </>
                ) : (
                  <>
                    <p className="drop-label">Drag & drop your Excel file here</p>
                    <p className="drop-hint">.xlsx / .xls only — or click to browse</p>
                  </>
                )}
              </div>

              <button className="upload-btn" disabled={!selectedFile || uploading} onClick={handleUpload}>
                {uploading ? <><Loader size={15} className="spin" /> Uploading…</> : <><Upload size={15} /> Upload File</>}
              </button>
            </div>
          </div>

          {/* Result banner — full width below both columns */}
          {uploadResult && (
            <div className={`upload-result ${uploadResult.success ? 'result-success' : 'result-error'}`}>
              {uploadResult.success ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
              <div>
                <strong>{uploadResult.success ? 'Success' : 'Error'}</strong>
                <p>{uploadResult.message}</p>
                {uploadResult.success && (
                  <p>{uploadResult.rowsImported} rows imported.{' '}
                    <button className="link-btn" onClick={() => setActiveTab(uploadResult.viewTab)}>View Data →</button>
                  </p>
                )}
                {uploadResult.success && uploadResult.skippedRows?.length > 0 && (
                  <div className="upload-skipped">
                    <div className="upload-skipped-title">
                      <FileWarning size={14} /> {uploadResult.skippedRows.length} row{uploadResult.skippedRows.length !== 1 ? 's' : ''} skipped (invalid values):
                    </div>
                    <ul className="upload-skipped-list">
                      {uploadResult.skippedRows.map((s) => (
                        <li key={s.row_number}>Row {s.row_number}: {s.reason}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Layered Audit tab ────────────────────────────────────────────────── */}
      {activeTab === 'layered-audit' && (
        <div className="master-panel">
          <div className="master-header">
            <div>
              <h2 className="panel-title">Layered Audit</h2>
              <p className="panel-subtitle">Click any cell to edit · Changes save automatically</p>
            </div>
            <div className="master-actions">
              <span className="record-count">{auditRecords.length} record{auditRecords.length !== 1 ? 's' : ''}</span>
              <button className="add-record-btn" onClick={() => setShowAddRecord('layered-audit')}>
                <Plus size={13} /> Add Record
              </button>
              <button className="refresh-btn" onClick={loadAuditRecords} disabled={loadingAudit}>
                {loadingAudit ? <Loader size={13} className="spin" /> : '↻'} Refresh
              </button>
            </div>
          </div>
          {loadingAudit && <div className="master-loading"><Loader size={28} className="spin" /><p>Loading records…</p></div>}
          {auditError && !loadingAudit && <div className="master-error"><AlertCircle size={20} /><p>{auditError}</p></div>}
          {!loadingAudit && !auditError && auditRecords.length === 0 && (
            <div className="master-empty">
              <Database size={40} strokeWidth={1} />
              <p>No records yet. Upload a Layered Audit Excel file first.</p>
              <button className="link-btn" onClick={() => { setActiveTab('upload'); setUploadType('layered-audit'); }}>Go to Upload →</button>
            </div>
          )}
          {!loadingAudit && auditRecords.length > 0 && (
            <AuditTable
              columns={LAYERED_AUDIT_COLUMNS}
              records={auditRecords}
              saveFn={layeredAuditApi.updateAuditRecord}
              onSaved={handleAuditRecordSaved}
            />
          )}
        </div>
      )}

      {/* ── Audit Adherence tab ──────────────────────────────────────────────── */}
      {activeTab === 'audit-adherence' && (
        <div className="master-panel">
          <div className="master-header">
            <div>
              <h2 className="panel-title">Audit Adherence</h2>
              <p className="panel-subtitle">Click any cell to edit · Audit Date must be a valid date</p>
            </div>
            <div className="master-actions">
              <span className="record-count">{adherenceRecords.length} record{adherenceRecords.length !== 1 ? 's' : ''}</span>
              <button className="add-record-btn" onClick={() => setShowAddRecord('audit-adherence')}>
                <Plus size={13} /> Add Record
              </button>
              <button className="refresh-btn" onClick={loadAdherenceRecords} disabled={loadingAdherence}>
                {loadingAdherence ? <Loader size={13} className="spin" /> : '↻'} Refresh
              </button>
            </div>
          </div>
          {loadingAdherence && <div className="master-loading"><Loader size={28} className="spin" /><p>Loading records…</p></div>}
          {adherenceError && !loadingAdherence && <div className="master-error"><AlertCircle size={20} /><p>{adherenceError}</p></div>}
          {!loadingAdherence && !adherenceError && adherenceRecords.length === 0 && (
            <div className="master-empty">
              <Database size={40} strokeWidth={1} />
              <p>No records yet. Upload an Audit Adherence Excel file first.</p>
              <button className="link-btn" onClick={() => { setActiveTab('upload'); setUploadType('audit-adherence'); }}>Go to Upload →</button>
            </div>
          )}
          {!loadingAdherence && adherenceRecords.length > 0 && (
            <AuditTable
              columns={LAYERED_ADHERENCE_COLUMNS}
              records={adherenceRecords}
              saveFn={layeredAuditApi.updateAdherenceRecord}
              onSaved={handleAdherenceRecordSaved}
            />
          )}
        </div>
      )}

      {/* ── Template tab ─────────────────────────────────────────────────────── */}
      {activeTab === 'template' && (
        <div className="template-panel">
          <div className="template-header">
            <FileDown size={22} className="template-header-icon" />
            <div>
              <h2 className="panel-title">Download Templates</h2>
              <p className="panel-subtitle">Download a pre-formatted CSV with the correct column headers. Fill your data and upload via the Upload tab.</p>
            </div>
          </div>

          <div className="template-cards">
            {Object.entries(TEMPLATE_DEFS).map(([key, def]) => (
              <div key={key} className="template-card">
                <div className="template-card-header">
                  <span className="template-card-title">{def.label}</span>
                  <button
                    className="template-download-btn"
                    onClick={() => downloadTemplate(key)}
                    title="Download blank template CSV"
                  >
                    <Download size={13} /> Download Template
                  </button>
                </div>
                <p className="template-card-desc">{def.desc}</p>

                {/* Inline column reference table — always visible */}
                <div className="template-col-table-wrap">
                  <table className="template-col-table">
                    <thead>
                      <tr>
                        <th className="tcol-num">#</th>
                        <th>Column Name</th>
                        <th>Hint / Allowed Values</th>
                      </tr>
                    </thead>
                    <tbody>
                      {def.columns.map((col, i) => (
                        <tr key={i}>
                          <td className="tcol-num">{i + 1}</td>
                          <td className="tcol-name">{col.name}</td>
                          <td className="tcol-hint">{col.hint}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Master Data tab ──────────────────────────────────────────────────── */}
      {activeTab === 'master' && (
        <div className="master-panel">
          <div className="master-header">
            <h2 className="panel-title">Master Data</h2>
            <div className="master-actions">
              <span className="record-count">{records.length} record{records.length !== 1 ? 's' : ''}</span>
              <button className="add-record-btn" onClick={() => setShowAddRecord('master')}>
                <Plus size={13} /> Add Record
              </button>
              <button className="add-month-btn" onClick={() => setShowAddMonth(true)}>
                <Plus size={13} /> Add New Month
              </button>
              <button className="refresh-btn" onClick={loadRecords} disabled={loadingRecords}>
                {loadingRecords ? <Loader size={13} className="spin" /> : '↻'} Refresh
              </button>
            </div>
          </div>

          {showAddMonth && (
            <AddMonthModal
              existingMonths={allMonths}
              onAdd={handleAddMonth}
              onClose={() => setShowAddMonth(false)}
            />
          )}

          {loadingRecords && (
            <div className="master-loading">
              <Loader size={28} className="spin" />
              <p>Loading records…</p>
            </div>
          )}

          {loadError && !loadingRecords && (
            <div className="master-error">
              <AlertCircle size={20} />
              <p>{loadError}</p>
            </div>
          )}

          {!loadingRecords && !loadError && records.length === 0 && (
            <div className="master-empty">
              <Database size={40} strokeWidth={1} />
              <p>No records yet. Upload an Excel file first.</p>
              <button className="link-btn" onClick={() => setActiveTab('upload')}>Go to Upload →</button>
            </div>
          )}

          {!loadingRecords && records.length > 0 && (
            <div className="table-wrapper">
              <table className="master-table">
                <thead>
                  <tr>
                    {FIXED_COLUMNS.map((col) => (
                      <th key={col.key} style={{ minWidth: col.width }}>
                        <div className="col-header-wrap">
                          <span className="col-header-label">{col.label}</span>
                          <ColumnFilterDropdown
                            colKey={col.key}
                            allValues={masterUniqueValues[col.key] || []}
                            selectedValues={masterFilters[col.key] ?? null}
                            onChange={handleMasterFilterChange}
                          />
                        </div>
                      </th>
                    ))}
                    {allMonths.map((key) => (
                      <th key={key} className="month-header">{formatMonthLabel(key)}</th>
                    ))}
                    {TRAILING_COLUMNS.map((col) => (
                      <th key={col.key} style={{ minWidth: col.width }}>
                        <div className="col-header-wrap">
                          <span className="col-header-label">{col.label}</span>
                          <ColumnFilterDropdown
                            colKey={col.key}
                            allValues={masterUniqueValues[col.key] || []}
                            selectedValues={masterFilters[col.key] ?? null}
                            onChange={handleMasterFilterChange}
                          />
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredMasterRecords.map((rec) => (
                    <tr key={rec.id}>
                      {FIXED_COLUMNS.map((col) => (
                        <EditableCell
                          key={col.key}
                          recordId={rec.id}
                          fieldKey={col.key}
                          value={rec[col.key]}
                          type={col.type}
                          onSaved={handleRecordSaved}
                        />
                      ))}
                      {allMonths.map((key) => (
                        <MonthlyCell
                          key={key}
                          recordId={rec.id}
                          monthKey={key}
                          monthlyData={rec.monthly_data}
                          onSaved={handleRecordSaved}
                        />
                      ))}
                      {TRAILING_COLUMNS.map((col) => (
                        <EditableCell
                          key={col.key}
                          recordId={rec.id}
                          fieldKey={col.key}
                          value={rec[col.key]}
                          type={col.type}
                          onSaved={handleRecordSaved}
                        />
                      ))}
                    </tr>
                  ))}
                  {filteredMasterRecords.length === 0 && (
                    <tr>
                      <td
                        colSpan={FIXED_COLUMNS.length + allMonths.length + TRAILING_COLUMNS.length}
                        className="filter-no-results"
                      >
                        No records match the current filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Add Record modal ─────────────────────────────────────────────────── */}
      {showAddRecord && (
        <AddRecordModal
          type={showAddRecord}
          onClose={() => setShowAddRecord(null)}
          onSaved={(newRec) => { handleRecordAdded(showAddRecord, newRec); setShowAddRecord(null); }}
          userId={userId}
          layoutId={selectedLayoutId}
          layoutStageIds={layoutStageIds}
        />
      )}

      <HelpGuide {...INPUT_HELP} />

      {/* ── Template preview modal ─────────────────────────────────────────── */}
      {templatePreviewModal && createPortal(
        <div className="template-modal-overlay">
          <div className="template-modal">
            <div className="template-modal-header">
              <span className="template-modal-title">
                {TEMPLATE_DEFS[templatePreviewModal]?.label} — Column Reference
              </span>
              <button className="template-modal-close" onClick={() => setTemplatePreviewModal(null)}>
                <X size={15} />
              </button>
            </div>

            <div className="template-modal-body">
              <table className="template-col-table">
                <thead>
                  <tr><th>#</th><th>Column Name</th><th>Hint / Allowed Values</th></tr>
                </thead>
                <tbody>
                  {(TEMPLATE_DEFS[templatePreviewModal]?.columns || []).map((col, i) => (
                    <tr key={i}>
                      <td className="tcol-num">{i + 1}</td>
                      <td className="tcol-name">{col.name}</td>
                      <td className="tcol-hint">{col.hint}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="template-modal-footer">
              <button className="template-modal-dl-btn" onClick={() => downloadTemplate(templatePreviewModal)}>
                <Download size={13} /> Download Template
              </button>
              <button className="template-modal-cancel-btn" onClick={() => setTemplatePreviewModal(null)}>
                Close
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
