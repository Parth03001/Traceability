import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useSearchParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { fixMarkdownTables } from '../../utils/markdownUtils';
import {
  ArrowLeft,
  Upload,
  Search,
  Trash2,
  Edit2,
  X,
  Check,
  BarChart2,
  Info,
  MapPin,
  ChevronRight,
  ChevronDown,
  Layout,
  AlertCircle,
  Download,
  Database,
  FileSpreadsheet,
  Layers,
  Map as MapIcon,
  Activity,
  History,
  ChevronUp,
  Bot,
  Send,
  ChevronLeft
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  ResponsiveContainer, 
  Cell,
  Legend,
  LabelList
} from 'recharts';
import { ComposableMap, Geographies, Geography } from "react-simple-maps";
import { scaleLinear } from "d3-scale";
import { backend_url, backend_url_ws } from '../../services/api/config';
import { authService } from '../../services/api';
import ChartComponent from '../ChartComponent';
import logoImg from '../../assests/logo.png';
import utilityLogo from '../../assests/image.png';
import mahindraRiseLogo from '../../assests/mahindra_rise_logo.png';
import './PartLabeler.css';

const API_BASE = `${backend_url}/part-labeler`;
const UPLOAD_BASE = backend_url.endsWith('/api')
  ? backend_url.replace('/api', '/uploads')
  : backend_url.replace('/api/', '/uploads/');

// =====================================================
// DATA SOURCE CONFIGURATION
// =====================================================
const DATA_SOURCES = {
  warranty: {
    key: 'warranty',
    label: 'Warranty Data',
    chartTitles: {
      mfgMonth: 'Vehicle Mfg Month Wise Data',
      reportingMonth: 'Reporting Month Wise Data',
      kms: 'Kms Wise Data',
      region: 'Locationwise Distribution',
    },
    useMapForRegion: true,
    targetColumns: [
      { key: 'complaint_code_desc', label: 'Complaint Code Desc', mandatory: true, group: 'Required' },
      { key: 'material_description', label: 'Material Description', mandatory: true, group: 'Required' },
      { key: 'manufac_yr_mon', label: 'Manufac_Yr_Mon', mandatory: true, group: 'Required' },
      { key: 'new_manufacturing_quater', label: 'New Manufacturing Quater', mandatory: true, group: 'Required' },
      { key: 'mis_bucket', label: 'MIS_BUCKET', mandatory: true, group: 'Required' },
      { key: 'base_model', label: 'BASE MODEL', mandatory: true, group: 'Required' },
      { key: 'claim_date', label: 'Claim Date', mandatory: true, group: 'Required' },
      { key: 'failure_kms', label: 'Failure Kms', mandatory: true, group: 'Required' },
      { key: 'region', label: 'Region', mandatory: true, group: 'Required' },
      { key: 'failure_date', label: 'Failure Date', group: 'Technical' },
      { key: 'part', label: 'part', group: 'Technical' },
      { key: 'serial_no', label: 'Serial No', group: 'Technical' },
      { key: 'vender', label: 'vender', group: 'Technical' },
      { key: 'vendor_manuf', label: 'Vendor/Manuf.', group: 'Technical' },
      { key: 'zone', label: 'Zone', group: 'Geography' },
      { key: 'area_office', label: 'Area Office', group: 'Geography' },
      { key: 'plant', label: 'Plant', group: 'Geography' },
      { key: 'plant_desc', label: 'PlantDesc', group: 'Geography' },
      { key: 'jdp_city', label: 'JDP City', group: 'Geography' },
      { key: 'commodity', label: 'Commodity', group: 'Classification' },
      { key: 'group_code', label: 'Group Code', group: 'Classification' },
      { key: 'group_code_desc', label: 'Group Code Desc', group: 'Classification' },
      { key: 'complaint_code', label: 'Complaint Code', group: 'Classification' },
      { key: 'model_code', label: 'Model Code', group: 'Classification' },
      { key: 'model_family', label: 'Model Family', group: 'Classification' },
      { key: 'claim_type', label: 'Claim Type', group: 'Claim Info' },
      { key: 'sap_claim_no', label: 'SAP Claim No', group: 'Claim Info' },
      { key: 'claim_desc', label: 'Claim Desc', group: 'Claim Info' },
      { key: 'service_type', label: 'Service Type', group: 'Claim Info' },
      { key: 'ro_number', label: 'RONumber', group: 'Claim Info' },
      { key: 'dealer_code', label: 'Dealer Code', group: 'Dealer' },
      { key: 'billing_dealer_name', label: 'Billing Dealer Name', group: 'Dealer' },
      { key: 'dealer_verbatim', label: 'Dealer Verbatim', group: 'Dealer' },
      { key: 'ac_non_ac', label: 'AC / Non AC', group: 'Specs' },
      { key: 'variant', label: 'Variant', group: 'Specs' },
      { key: 'drive_type', label: 'Drive Type', group: 'Specs' },
    ],
  },
  rpt: {
    key: 'rpt',
    label: 'Offline RPT Data',
    chartTitles: {
      mfgMonth: 'Vehicle Mfg Month Wise Data',
      reportingMonth: 'Attribute Name Wise Data',
      kms: 'Shift Wise Data',
      region: 'Location Name Wise Distribution',
    },
    useMapForRegion: false,
    targetColumns: [
      { key: 'date_col', label: 'DATE', mandatory: true, group: 'Required', hint: 'e.g. 2026-01-01' },
      { key: 'model', label: 'Model', mandatory: true, group: 'Required' },
      { key: 'defect_category', label: 'Defect_Category', mandatory: true, group: 'Required', hint: 'Used for MIS filter' },
      { key: 'part_defect', label: 'PartDefect', mandatory: true, group: 'Required', hint: 'Used for failure search' },
      { key: 'attribute_name', label: 'Attribute_Name', mandatory: true, group: 'Required', hint: 'Used for Reporting Month chart' },
      { key: 'location_name', label: 'Location_Name', mandatory: true, group: 'Required', hint: 'Used for Location chart' },
      { key: 'shift', label: 'Shift', mandatory: true, group: 'Required', hint: 'Used for Shift/KMS chart' },
      { key: 'body_sr_no', label: 'BODYSRNO', group: 'Vehicle Info' },
      { key: 'vin_number', label: 'VIN_Number', group: 'Vehicle Info' },
      { key: 'buyoff_stage', label: 'Buyoff Stage', group: 'Vehicle Info' },
      { key: 'platform_group', label: 'Platform Group', group: 'Vehicle Info' },
      { key: 'stage_name', label: 'Stage Name', group: 'Vehicle Info' },
      { key: 'part', label: 'PART', group: 'Defect Info' },
      { key: 'defect', label: 'Defect', group: 'Defect Info' },
      { key: 'custom_attribution', label: 'Custom Attribution', group: 'Defect Info' },
      { key: 'offline_val', label: '_Offline', group: 'Defect Info' },
      { key: 'online_val', label: '_Online', group: 'Defect Info' },
      { key: 'rework_status', label: 'REWORK_STATUS', group: 'Defect Info' },
      { key: 'defect_status', label: 'DEFECT_STATUS', group: 'Defect Info' },
      { key: 'as_is_ok', label: 'As_Is_Ok', group: 'Defect Info' },
      { key: 'shop_name', label: 'Shop_Name', group: 'Other' },
      { key: 'model_description', label: 'Model_Description', group: 'Other' },
      { key: 'model_code', label: 'ModelCode', group: 'Other' },
      { key: 'severity_name', label: 'Severity Name', group: 'Other' },
      { key: 'domestic_export', label: 'Domestic/Export', group: 'Other' },
    ],
  },
  gnovac: {
    key: 'gnovac',
    label: 'GNOVAC Data',
    chartTitles: {
      mfgMonth: 'Vehicle Mfg Month Wise Data',
      reportingMonth: 'Attribution Wise Data',
      kms: 'Concern Severity (Pointer) Wise Data',
      region: 'Location Name Wise Distribution',
    },
    useMapForRegion: false,
    targetColumns: [
      { key: 'audit_date', label: 'Audit Date', mandatory: true, group: 'Required', hint: 'e.g. 2026-01-01' },
      { key: 'model_code', label: 'Model Code', mandatory: true, group: 'Required', hint: 'Used for Model filter' },
      { key: 'pointer', label: 'Pointer', mandatory: true, group: 'Required', hint: 'Used for MIS filter & KMS chart' },
      { key: 'part_name', label: 'Part Name', mandatory: true, group: 'Required', hint: 'Used for failure search' },
      { key: 'defect_name', label: 'Defect Name', mandatory: true, group: 'Required', hint: 'Used for failure search' },
      { key: 'attribution', label: 'Attribution', mandatory: true, group: 'Required', hint: 'Used for Reporting Month chart' },
      { key: 'location_name', label: 'Location Name', mandatory: true, group: 'Required', hint: 'Used for Location chart' },
      { key: 'vin_no', label: 'VIN No', group: 'Vehicle Info' },
      { key: 'plant_name', label: 'Plant Name', group: 'Vehicle Info' },
      { key: 'variant_name', label: 'Variant Name', group: 'Vehicle Info' },
      { key: 'fuel_type', label: 'Fuel Type', group: 'Vehicle Info' },
      { key: 'build_phase_name', label: 'BuildPhase Name', group: 'Vehicle Info' },
      { key: 'body_no', label: 'Body No', group: 'Vehicle Info' },
      { key: 'concern_type_name', label: 'Concern Type Name', group: 'Defect Info' },
      { key: 'four_m', label: '4M', group: 'Analysis' },
      { key: 'four_m_analysis_name', label: '4M Analysis Name', group: 'Analysis' },
      { key: 'root_cause', label: 'Root Cause', group: 'Analysis' },
      { key: 'ica', label: 'ICA', group: 'Analysis' },
      { key: 'pca', label: 'PCA', group: 'Analysis' },
      { key: 'responsibility', label: 'Responsibility', group: 'Analysis' },
      { key: 'target_date', label: 'Target Date', group: 'Analysis' },
      { key: 'status', label: 'Status', group: 'Other' },
      { key: 'frequency', label: 'Frequency', group: 'Other' },
      { key: 'new_and_repeat', label: 'New and repeat', group: 'Other' },
      { key: 'remark', label: 'Remark', group: 'Other' },
    ],
  },
  rfi: {
    key: 'rfi',
    label: 'RFI Data',
    chartTitles: {
      mfgMonth: 'Vehicle Mfg Month Wise Data',
      reportingMonth: 'Attribution Name Wise Data',
      kms: 'DefectType & Severity Wise Data',
      region: 'Area Name Wise Distribution',
    },
    useMapForRegion: false,
    targetColumns: [
      { key: 'date_col', label: 'Date', mandatory: true, group: 'Required', hint: 'e.g. 2025-04-01' },
      { key: 'model_name', label: 'Model Name', mandatory: true, group: 'Required', hint: 'Used for Model filter' },
      { key: 'severity_name', label: 'Severity Name', mandatory: true, group: 'Required', hint: 'Used for MIS filter & KMS chart' },
      { key: 'part_name', label: 'Part Name', mandatory: true, group: 'Required', hint: 'Used for failure search' },
      { key: 'defect_name', label: 'Defect Name', mandatory: true, group: 'Required', hint: 'Used for failure search' },
      { key: 'attribution_name', label: 'Attribution Name', mandatory: true, group: 'Required', hint: 'Used for Reporting Month chart' },
      { key: 'area_name', label: 'Area Name', mandatory: true, group: 'Required', hint: 'Used for Location chart' },
      { key: 'defect_type_name', label: 'DefectType Name', mandatory: true, group: 'Required', hint: 'Used for KMS joint chart' },
      { key: 'plant_name', label: 'Plant Name', group: 'Vehicle Info' },
      { key: 'vin_no', label: 'Vin No', group: 'Vehicle Info' },
      { key: 'biw_no', label: 'BIW No', group: 'Vehicle Info' },
      { key: 'variant', label: 'Variant', group: 'Vehicle Info' },
      { key: 'fuel', label: 'Fuel', group: 'Vehicle Info' },
      { key: 'drive_name', label: 'Drive Name', group: 'Vehicle Info' },
      { key: 'build_phase_name', label: 'Build Phase Name', group: 'Vehicle Info' },
      { key: 'software_v_name', label: 'SoftwareV Name', group: 'Vehicle Info' },
      { key: 'color_name', label: 'Color Name', group: 'Vehicle Info' },
      { key: 'country_name', label: 'Country Name', group: 'Vehicle Info' },
      { key: 'location_name', label: 'Location Name', group: 'Defect Info' },
      { key: 'stage_name', label: 'Stage Name', group: 'Analysis' },
      { key: 'root_cause', label: 'Root Cause', group: 'Analysis' },
      { key: 'ica', label: 'ICA', group: 'Analysis' },
      { key: 'pca', label: 'PCA', group: 'Analysis' },
      { key: 'target_date', label: 'Target Date', group: 'Analysis' },
      { key: 'responsibility', label: 'Responsibility', group: 'Other' },
      { key: 'status', label: 'Status', group: 'Other' },
      { key: 'category_name', label: 'Category Name', group: 'Other' },
      { key: 'analysis_name', label: 'Analysis Name', group: 'Other' },
      { key: 'action_plan_status', label: 'Action plan status', group: 'Other' },
      { key: 'frequency', label: 'Frequency', group: 'Other' },
    ],
  },
  esqa: {
    key: 'esqa',
    label: 'e-SQA Data',
    chartTitles: {
      mfgMonth: 'Vehicle Mfg Month Wise Data',
      reportingMonth: 'Commodity Wise Data',
      kms: 'Concern Source Wise Data',
      region: 'Concern Severity Wise Distribution',
    },
    useMapForRegion: false,
    targetColumns: [
      { key: 'concern_report_date', label: 'Concern Report Date', mandatory: true, group: 'Required', hint: 'e.g. 2024-07-23' },
      { key: 'vehicle_model', label: 'Vehicle Model', mandatory: true, group: 'Required', hint: 'Used for Model filter' },
      { key: 'concern_category', label: 'Concern Catergory', mandatory: true, group: 'Required', hint: 'Used for MIS filter' },
      { key: 'part_name', label: 'Part Name', mandatory: true, group: 'Required', hint: 'Used for failure search' },
      { key: 'concern_description', label: 'Concern Description', mandatory: true, group: 'Required', hint: 'Used for failure search' },
      { key: 'commodity', label: 'Commodity', mandatory: true, group: 'Required', hint: 'Used for Reporting Month chart' },
      { key: 'concern_source', label: 'Concern Source', mandatory: true, group: 'Required', hint: 'Used for KMS chart' },
      { key: 'concern_severity', label: 'Concern Severity', mandatory: true, group: 'Required', hint: 'Used for Location chart' },
      { key: 'concern_number', label: 'Concern Number', group: 'Concern Info' },
      { key: 'pu_name', label: 'Pu Name', group: 'Concern Info' },
      { key: 'part_no', label: 'Part No', group: 'Concern Info' },
      { key: 'vendor_code', label: 'Vendor Code', group: 'Concern Info' },
      { key: 'vendor_name', label: 'Vendor Name', group: 'Concern Info' },
      { key: 'vehicle_variant', label: 'Vehicle Variant', group: 'Vehicle Info' },
      { key: 'concern_repeat', label: 'Concern Repeat', group: 'Vehicle Info' },
      { key: 'concern_attribution', label: 'Concern Attribution', group: 'Analysis' },
      { key: 'initial_analysis', label: 'Initial Analysis & Reason', group: 'Analysis' },
      { key: 'sqa_officer', label: 'SQA Officer', group: 'Analysis' },
      { key: 'ica_possible', label: 'ICA Possible', group: 'Analysis' },
      { key: 'reason_ica_not_possible', label: 'Reason for ICA Not Possible', group: 'Analysis' },
      { key: 'ica_details', label: 'ICA Details at M&M', group: 'Analysis' },
      { key: 'ica_failure', label: 'ICA Failure', group: 'Analysis' },
      { key: 'qty_reported', label: 'Qty. Reported', group: 'Quantities' },
      { key: 'segregation_qty', label: 'Segregation Qty', group: 'Quantities' },
      { key: 'ok_qty', label: 'OK Qty', group: 'Quantities' },
      { key: 'rejection_qty', label: 'Rejection Qty', group: 'Quantities' },
      { key: 'scrap_qty', label: 'Scrap Qty', group: 'Quantities' },
      { key: 'rework_qty', label: 'Rework Qty', group: 'Quantities' },
      { key: 'esqa_number', label: 'ESQA Number', group: 'ESQA' },
      { key: 'esqa_posting_date', label: 'ESQA Posting Date', group: 'ESQA' },
    ],
  },
  all: {
    key: 'all',
    label: 'All Sources',
    chartTitles: { mfgMonth: '', reportingMonth: '', kms: '', region: '' },
    useMapForRegion: false,
    targetColumns: [],
  },
};

// Use the local TopoJSON file from the public folder
const INDIA_TOPO_JSON = "/india-topo.json";

/**
 * Helper Components (Outside main component for better performance)
 */

// =====================================================
// DATA SOURCE SELECTOR COMPONENT
// =====================================================
const DataSourceSelector = ({ current, onChange }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="data-source-selector" ref={ref}>
      <button className="ds-toggle" onClick={() => setOpen(!open)}>
        <Database size={15} />
        <span className="ds-label">Data Source:</span>
        <span className="ds-value">{DATA_SOURCES[current].label}</span>
        <ChevronDown size={13} className={open ? 'ds-chevron open' : 'ds-chevron'} />
      </button>
      {open && (
        <div className="ds-dropdown">
          {Object.values(DATA_SOURCES).map(src => (
            <div
              key={src.key}
              className={`ds-option ${current === src.key ? 'active' : ''}`}
              onClick={() => { onChange(src.key); setOpen(false); }}
            >
              {src.label}
              {current === src.key && <Check size={13} className="ds-check" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// =====================================================
// LOCATION BAR CHART (for non-warranty sources)
// =====================================================
const LocationBarChart = ({ data, title }) => (
  <div className="dashboard-chart-card">
    <div className="chart-header">
      <MapIcon size={16} />
      <span>{title}</span>
    </div>
    <div className="chart-container-inner">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 20, right: 5, left: -30, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
          <XAxis
            dataKey="label"
            fontSize={9}
            tick={{ fill: '#7f8c8d' }}
            axisLine={{ stroke: '#e9ecef' }}
            tickLine={false}
            interval={0}
            angle={-30}
            textAnchor="end"
            height={40}
          />
          <YAxis fontSize={10} tick={{ fill: '#7f8c8d' }} axisLine={false} tickLine={false} />
          <RechartsTooltip cursor={{ fill: '#fff5f5' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
          <Bar dataKey="value" fill="#667eea" radius={[4, 4, 0, 0]} barSize={10}>
            <LabelList dataKey="value" position="top" fontSize={8} fill="#7f8c8d" offset={5}
              formatter={(v) => v > 0 ? v : ''} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  </div>
);

const CustomBarChart = ({ title, data, color, icon: Icon }) => (
  <div className="dashboard-chart-card">
    <div className="chart-header">
      <Icon size={16} />
      <span>{title}</span>
    </div>
    <div className="chart-container-inner">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 20, right: 5, left: -30, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
          <XAxis 
            dataKey="label" 
            fontSize={9} 
            tick={{ fill: '#7f8c8d' }} 
            axisLine={{ stroke: '#e9ecef' }} 
            tickLine={false}
            interval={0}
            angle={-30}
            textAnchor="end"
            height={40}
          />
          <YAxis fontSize={10} tick={{ fill: '#7f8c8d' }} axisLine={false} tickLine={false} />
          <RechartsTooltip cursor={{ fill: '#fff5f5' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
          <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} barSize={10}>
            <LabelList dataKey="value" position="top" fontSize={8} fill="#7f8c8d" offset={5}
              formatter={(v) => v > 0 ? v : ''} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  </div>
);

const IndiaMap = ({ data }) => {
  const [hoveredState, setHoveredState] = useState(null);
  const maxValue = Math.max(...data.map(d => d.value), 1);
  const colorScale = scaleLinear().domain([0, maxValue]).range(["#f0fdf4", "#166534"]); 

      return (
        <div className="india-map-wrapper">
          <ComposableMap
            projection="geoMercator"
            projectionConfig={{ scale: 700, center: [80, 22] }}
            width={400}
            height={400}
            style={{ width: "100%", height: "100%", maxWidth: "100%", maxHeight: "100%" }}
          >        <Geographies geography={INDIA_TOPO_JSON}>
          {({ geographies }) =>
            geographies.map((geo) => {
              const stateName = geo.properties.st_nm || geo.properties.ST_NM;
              const match = data.find(d => d.label.toLowerCase() === stateName?.toLowerCase());
              const count = match ? match.value : 0;
              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  onMouseEnter={(e) => setHoveredState({ name: stateName, count, x: e.clientX, y: e.clientY })}
                  onMouseMove={(e) => setHoveredState({ name: stateName, count, x: e.clientX, y: e.clientY })}
                  onMouseLeave={() => setHoveredState(null)}
                  style={{
                    default: { fill: colorScale(count), stroke: "#cbd5e1", strokeWidth: 0.5, outline: "none" },
                    hover: { fill: "#22c55e", stroke: "#166534", strokeWidth: 1, outline: "none", cursor: "pointer" },
                    pressed: { fill: "#15803d", outline: "none" }
                  }}
                />
              );
            })
          }
        </Geographies>
      </ComposableMap>
      {hoveredState && (
        <div className="map-tooltip" style={{ left: hoveredState.x - 100, top: hoveredState.y - 100 }}>
          <div className="tooltip-state">{hoveredState.name}</div>
          <div className="tooltip-count"><strong>{hoveredState.count}</strong> Failures</div>
        </div>
      )}
    </div>
  );
};

// ── AgentMessage: renders a single chat bubble with markdown + optional chart ──
const AgentMessage = ({ msg }) => {
  const fixedText = useMemo(() => {
    if (!msg.text || msg.sender !== 'bot') return msg.text || '';
    return fixMarkdownTables(msg.text, true);
  }, [msg.text, msg.sender]);

  if (msg.sender === 'user') {
    return (
      <div className="agent-msg user">
        <div className="agent-msg-bubble">
          <p>{msg.text}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`agent-msg bot${msg.isError ? ' error' : ''}`}>
      <div className="agent-msg-avatar"><Bot size={13} /></div>
      <div className="agent-msg-bubble">
        {/* Chart rendered above the text, matching ChatMessage.js pattern */}
        {msg.chart_data && (
          <div className="agent-chart-wrap">
            <ChartComponent chartData={msg.chart_data} />
          </div>
        )}
        <div className="agent-msg-markdown">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              table: ({ node, ...props }) => (
                <div className="agent-table-wrap"><table {...props} /></div>
              ),
            }}
          >
            {fixedText}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
};

function PartLabeler() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isPlantMode = searchParams.get('mode') === 'plant';
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const settingsMenuRef = useRef(null);
  const currentUsername = authService.getFullName();

  const [userId] = useState(() => {
    const id = sessionStorage.getItem('user_id');
    return id ? parseInt(id, 10) : null;
  });

  const [dataSource, setDataSource] = useState('warranty');
  const [prefix] = useState(() => searchParams.get('prefix') || '');
  const [selectedImage, setSelectedImage] = useState(null);
  const [images, setImages] = useState([]);
  const [labels, setLabels] = useState([]);
  const [labelFailures, setLabelFailures] = useState({});
  const [labelFailuresBySource, setLabelFailuresBySource] = useState({});
  const [allModeActiveSource, setAllModeActiveSource] = useState(null); // { label, src } when drilling into a source in All mode
  const [showInput, setShowInput] = useState(null);
  const [activePopup, setActivePopup] = useState(null);
  const [warrantyHistory, setWarrantyHistory] = useState([]);
  const [dashboardData, setDashboardData] = useState({ mfgMonth: [], reportingMonth: [], kms: [], region: [] });
  const [filterMonth, setFilterMonth] = useState(['All']);
  const [filterModel, setFilterModel] = useState(['All']);
  const [filterMIS, setFilterMIS] = useState(['All']);
  const [filterMfgQtr, setFilterMfgQtr] = useState(['All']);
  const [filterBuyoffStage, setFilterBuyoffStage] = useState(['All']);
  const [filterOnlineOffline, setFilterOnlineOffline] = useState(['All']);
  const [filterDefectType, setFilterDefectType] = useState(['All']);
  const [filterOptions, setFilterOptions] = useState({ models: [], mis_buckets: [], mfg_quarters: [], mfg_months: [], buyoff_stages: [], online_offline_options: [], defect_types: [] });
  const [openFilter, setOpenFilter] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSummaryActive, setIsSummaryActive] = useState(false);
  const [nodePositions, setNodePositions] = useState([]);
  const [partName, setPartName] = useState('');
  const [isEditingLabel, setIsEditingLabel] = useState(false);
  const [editLabelName, setEditLabelName] = useState('');

  // ── Agent panel state ─────────────────────────────────────────────────
  const [showAgentPanel, setShowAgentPanel] = useState(false);
  const [agentView, setAgentView] = useState('chat'); // 'chat' | 'history'
  const [agentMessages, setAgentMessages] = useState([]);
  const [agentInput, setAgentInput] = useState('');
  const [agentLoading, setAgentLoading] = useState(false);
  const [agentConvId, setAgentConvId] = useState(null);
  const [agentThinkingSteps, setAgentThinkingSteps] = useState([]);
  const [agentStreamingText, setAgentStreamingText] = useState('');
  const [agentHistory, setAgentHistory] = useState([]);
  const [agentHistoryLoading, setAgentHistoryLoading] = useState(false);
  const [agentThinkingOpen, setAgentThinkingOpen] = useState(false);
  // Progress tracking: { stage: 'thinking'|'generating'|'retrying', detail: string, stepCount: number }
  const [agentProgress, setAgentProgress] = useState(null);
  // Holds chart data received from the backend until the final message is committed
  const agentPendingChartRef = useRef(null);
  const agentWsRef = useRef(null);
  const agentMessagesRef = useRef([]);
  const agentPanelBodyRef = useRef(null);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (!e.target.closest('.month-filter-compact')) {
        setOpenFilter(null);
      }
      if (settingsMenuRef.current && !settingsMenuRef.current.contains(e.target)) {
        setShowSettingsMenu(false);
      }
    };
    window.addEventListener('mousedown', handleOutsideClick);
    return () => window.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const handleLogout = async () => {
    await authService.logout();
    setShowSettingsMenu(false);
    navigate('/');
    window.location.reload();
  };

  const fetchDashboardData = async (partNameArg = null, srcOverride = null) => {
    if (!userId) return;
    const src = srcOverride || dataSource;
    try {
      const params = new URLSearchParams();
      params.append('userId', userId);
      params.append('dataSource', src);
      if (prefix) params.append('prefix', prefix);

      if (partNameArg) {
        params.append('partName', partNameArg);
      } else if (labels && labels.length > 0) {
        labels.forEach(l => params.append('partName', l.partName));
      }

      filterMonth.forEach(m => params.append('month', m));
      filterModel.forEach(m => params.append('baseModel', m));
      filterMIS.forEach(m => params.append('misBucket', m));
      filterMfgQtr.forEach(m => params.append('mfgQtr', m));
      if ((src || dataSource) === 'rpt') {
        filterBuyoffStage.forEach(m => params.append('buyoffStage', m));
        filterOnlineOffline.forEach(m => params.append('onlineOffline', m));
      }
      if ((src || dataSource) === 'rfi') {
        filterDefectType.forEach(m => params.append('defectType', m));
      }

      const res = await fetch(`${API_BASE}/dashboard-data?${params.toString()}`);
      const data = await res.json();
      setDashboardData(data);
    } catch (err) {
      console.error("Failed to fetch dashboard data", err);
    }
  };

  const fetchActivePartHistory = async (label, srcOverride = null) => {
    if (!userId || !label) return;
    const src = srcOverride || dataSource;
    try {
      const params = new URLSearchParams();
      params.append('userId', userId);
      params.append('partName', label.partName);
      params.append('dataSource', src);
      if (prefix) params.append('prefix', prefix);
      filterMonth.forEach(m => params.append('month', m));
      filterModel.forEach(m => params.append('baseModel', m));
      filterMIS.forEach(m => params.append('misBucket', m));
      filterMfgQtr.forEach(m => params.append('mfgQtr', m));
      if (src === 'rpt') {
        filterBuyoffStage.forEach(m => params.append('buyoffStage', m));
        filterOnlineOffline.forEach(m => params.append('onlineOffline', m));
      }
      if (src === 'rfi') {
        filterDefectType.forEach(m => params.append('defectType', m));
      }

      const res = await fetch(`${API_BASE}/warranty-lookup?${params.toString()}`);
      const data = await res.json();
      if (!data.error) setWarrantyHistory(Array.isArray(data) ? data : [data]);
    } catch (err) {
      console.error("No history found", err);
    }
  };

  const updateAllLabelFailures = async (currentLabels, month, model, mis, qtr, src) => {
    if (!userId) return;
    const src_ = src || dataSource;
    const counts = {};
    await Promise.all(currentLabels.map(async (label) => {
      try {
        const params = new URLSearchParams();
        params.append('userId', userId);
        params.append('partName', label.partName);
        params.append('dataSource', src_);
        month.forEach(m => params.append('month', m));
        model.forEach(m => params.append('baseModel', m));
        mis.forEach(m => params.append('misBucket', m));
        qtr.forEach(m => params.append('mfgQtr', m));
        if (src_ === 'rpt') {
          filterBuyoffStage.forEach(m => params.append('buyoffStage', m));
          filterOnlineOffline.forEach(m => params.append('onlineOffline', m));
        }
        if (src_ === 'rfi') {
          filterDefectType.forEach(m => params.append('defectType', m));
        }

        const res = await fetch(`${API_BASE}/warranty-lookup?${params.toString()}`);
        const data = await res.json();
        const records = Array.isArray(data) ? data : [data];
        const count = records.reduce((sum, r) => sum + (r.failureCount || 0), 0);
        counts[label.id] = count;
      } catch (err) {
        counts[label.id] = 0;
      }
    }));
    setLabelFailures(counts);
  };

  const REAL_SOURCES = ['warranty', 'rpt', 'gnovac', 'rfi', 'esqa'];

  const updateAllLabelFailuresAllSources = async (currentLabels) => {
    if (!userId) return;
    const bySource = {};
    await Promise.all(currentLabels.map(async (label) => {
      bySource[label.id] = {};
      await Promise.all(REAL_SOURCES.map(async (src) => {
        try {
          const params = new URLSearchParams();
          params.append('userId', userId);
          params.append('partName', label.partName);
          params.append('dataSource', src);
          params.append('month', 'All');
          params.append('baseModel', 'All');
          params.append('misBucket', 'All');
          params.append('mfgQtr', 'All');
          const res = await fetch(`${API_BASE}/warranty-lookup?${params.toString()}`);
          const data = await res.json();
          const records = Array.isArray(data) ? data : [data];
          bySource[label.id][src] = records.reduce((sum, r) => sum + (r.failureCount || 0), 0);
        } catch {
          bySource[label.id][src] = 0;
        }
      }));
    }));
    setLabelFailuresBySource(bySource);
  };

  useEffect(() => {
    if (!userId) {
      navigate('/');
      return;
    }
    fetchImages();
    fetchFilterOptions(dataSource);
    fetchDashboardData();
  }, [userId]);

  // Reload filters and dashboard when data source changes
  useEffect(() => {
    if (!userId) return;
    if (dataSource === 'all') {
      if (labels.length > 0) updateAllLabelFailuresAllSources(labels);
      return;
    }
    fetchFilterOptions(dataSource);
    fetchDashboardData(null, dataSource);
    if (labels.length > 0) updateAllLabelFailures(labels, filterMonth, filterModel, filterMIS, filterMfgQtr, dataSource);
  }, [dataSource]);

  useEffect(() => {
    if (dataSource === 'all') {
      // In drill-down mode, re-fetch charts and active part history for the active source when filters change
      if (allModeActiveSource) {
        fetchDashboardData(allModeActiveSource.label.partName, allModeActiveSource.src);
        fetchActivePartHistory(allModeActiveSource.label, allModeActiveSource.src);
      } else {
        if (labels.length > 0) updateAllLabelFailuresAllSources(labels);
      }
      return;
    }
    if (labels.length > 0) {
      updateAllLabelFailures(labels, filterMonth, filterModel, filterMIS, filterMfgQtr);
    }
    if (activePopup) {
      fetchActivePartHistory(activePopup);
    }
    fetchDashboardData(activePopup?.partName);
  }, [filterMonth, filterModel, filterMIS, filterMfgQtr, filterBuyoffStage, filterOnlineOffline, filterDefectType, activePopup, labels, isSummaryActive]);

  // Fetch filter options when drilling into a source from All Sources mode
  useEffect(() => {
    if (allModeActiveSource) {
      fetchFilterOptions(allModeActiveSource.src);
    }
  }, [allModeActiveSource?.src]);

  const imgRef = useRef(null);
  const cadInputRef = useRef(null);
  const warrantyInputRef = useRef(null);
  const [connectorPath, setConnectorPath] = useState("");
  const [expandedImageId, setExpandedImageId] = useState(null);

  const [excelHeaders, setExcelHeaders] = useState([]);
  const [tempFilePath, setTempFilePath] = useState('');
  const [columnMapping, setColumnMapping] = useState({});
  const [ingestResult, setIngestResult] = useState(null);
  const [ingestingForSource, setIngestingForSource] = useState(null); // which source being uploaded in All mode
  const [sourceDataStatus, setSourceDataStatus] = useState({}); // { warranty: true/false, rpt: true/false, ... }

  // Derived from current data source config
  // When in All mode and uploading for a specific source, use that source's config for the modal
  const activeIngestSource = ingestingForSource || (dataSource !== 'all' ? dataSource : 'warranty');
  const targetColumns = DATA_SOURCES[activeIngestSource]?.targetColumns || DATA_SOURCES.warranty.targetColumns;
  const mandatoryColumns = targetColumns.filter(c => c.mandatory);
  const sourceConfig = DATA_SOURCES[dataSource] || DATA_SOURCES.warranty;
  const ingestConfig = DATA_SOURCES[activeIngestSource] || DATA_SOURCES.warranty;

  // When data source changes, reset filters and reload
  const handleDataSourceChange = (newSource) => {
    setDataSource(newSource);
    setFilterMonth(['All']);
    setFilterModel(['All']);
    setFilterMIS(['All']);
    setFilterMfgQtr(['All']);
    setFilterBuyoffStage(['All']);
    setFilterOnlineOffline(['All']);
    setFilterDefectType(['All']);
    setFilterOptions({ models: [], mis_buckets: [], mfg_quarters: [], mfg_months: [], buyoff_stages: [], online_offline_options: [], defect_types: [] });
    setDashboardData({ mfgMonth: [], reportingMonth: [], kms: [], region: [] });
    setActivePopup(null);
    setWarrantyHistory([]);
    setLabelFailuresBySource({});
    setAllModeActiveSource(null);
  };

  // In "All Sources" mode: clicking a source cell drills into that source's charts
  const handleAllModeSourceClick = (label, src) => {
    setActivePopup(label);
    setAllModeActiveSource({ label, src });
    fetchDashboardData(label.partName, src);
    fetchActivePartHistory(label, src);
  };

  const checkAllSourcesStatus = async () => {
    const status = {};
    await Promise.all(REAL_SOURCES.map(async (src) => {
      try {
        const res = await fetch(`${API_BASE}/filter-options?userId=${userId}&dataSource=${src}`);
        const data = await res.json();
        status[src] = (data.mfg_months?.length > 0 || data.models?.length > 0);
      } catch {
        status[src] = false;
      }
    }));
    setSourceDataStatus(status);
  };

  const handleDataIngestionStart = () => {
    setColumnMapping({});
    setIngestResult(null);
    if (dataSource === 'all') {
      checkAllSourcesStatus();
      setModalType('ingest-all-overview');
    } else {
      setModalType('ingest-start');
    }
  };

  const handleIngestForSource = (src) => {
    setIngestingForSource(src);
    setColumnMapping({});
    setIngestResult(null);
    setModalType('ingest-start');
  };

  const handleDataIngestionFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    uploadDataForMapping(file);
  };

  const uploadDataForMapping = async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/warranty-upload`, { method: 'POST', body: formData });
      const data = await res.json();
      setExcelHeaders(data.headers);
      setTempFilePath(data.tempFilePath);
      const initialMap = {};
      data.headers.forEach(header => {
        const match = targetColumns.find(tc => tc.label.toLowerCase() === header.toLowerCase() || tc.key.toLowerCase() === header.toLowerCase());
        if (match) initialMap[match.key] = header;
      });
      setColumnMapping(initialMap);
      setModalType('ingest-mapping');
    } catch (err) {
      alert("Failed to upload data file");
    } finally {
      setIsLoading(false);
    }
  };

  const confirmMappingAndProcess = async (userId) => {
    const missing = mandatoryColumns.find(col => !columnMapping[col.key]);
    if (missing) {
      alert(`Please map your column for: ${missing.label}`);
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/warranty-confirm-mapping`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tempFilePath, mapping: columnMapping, userId, dataSource: activeIngestSource })
      });
      const data = await res.json();
      if (data.success) {
        setIngestResult(data.count);
        setModalType('ingest-success');
        fetchFilterOptions(activeIngestSource);
        if (selectedImage) fetchLabels(selectedImage.id);
        // In All Sources mode: mark this source as having data and refresh counts
        if (dataSource === 'all') {
          setSourceDataStatus(prev => ({ ...prev, [activeIngestSource]: true }));
          if (labels.length > 0) updateAllLabelFailuresAllSources(labels);
        }
      }
    } catch (err) {
      alert("Failed to process mapping");
    } finally {
      setIsLoading(false);
    }
  };

  const [modalType, setModalType] = useState(null);
  const [modalData, setModalTypeData] = useState(null);
  const [pendingFile, setPendingFile] = useState(null);
  const [customImageName, setCustomImageName] = useState('');

  const fetchImages = async () => {
    if (!userId) return;
    try {
      const res = await fetch(`${API_BASE}/images?userId=${userId}`);
      const data = await res.json();
      setImages(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to fetch images", err);
      setImages([]);
    }
  };

  useEffect(() => {
    if (selectedImage) {
      fetchLabels(selectedImage.id);
    }
  }, [selectedImage]);

  const fetchLabels = async (imageId) => {
    if (!imageId || imageId === 'undefined' || !userId) return;
    try {
      const res = await fetch(`${API_BASE}/labels/${imageId}?userId=${userId}`);
      const data = await res.json();
      const labelsArray = Array.isArray(data) ? data : [];
      setLabels(labelsArray);
      updateAllLabelFailures(labelsArray, filterMonth, filterModel, filterMIS, filterMfgQtr);
    } catch (err) {
      console.error("Failed to fetch labels", err);
      setLabels([]);
    }
  };

  const fetchFilterOptions = async (src) => {
    if (!userId) return;
    const source = src || dataSource;
    try {
      const res = await fetch(`${API_BASE}/filter-options?userId=${userId}&dataSource=${source}`);
      const data = await res.json();
      setFilterOptions(data);
    } catch (err) {
      console.error("Failed to fetch filter options", err);
    }
  };

  useEffect(() => {
    let interval;
    if (activePopup && imgRef.current) {
      const updatePath = () => {
        const container = document.querySelector('.cad-img-container');
        if (!container) return;
        const imgRect = container.getBoundingClientRect();
        const workspace = document.querySelector('.cad-viewer');
        if (!workspace) return;
        const workRect = workspace.getBoundingClientRect();
        const mx = imgRect.left - workRect.left + (activePopup.x * imgRect.width / 100)+ 20;
        const my = imgRect.top - workRect.top + (activePopup.y * imgRect.height / 100) - 22.6;
        const detailPanel = document.querySelector('.marker-detail-floating');
        let tx = workRect.width - 360; 
        let ty = 160;
        if (detailPanel) {
          const detailRect = detailPanel.getBoundingClientRect();
          tx = detailRect.left - workRect.left;
          ty = detailRect.top - workRect.top + 100;
        }
        setConnectorPath(`M ${mx} ${my} L ${mx + (tx - mx) * 0.5} ${my} L ${tx} ${ty}`);
      };
      updatePath();
      interval = setInterval(updatePath, 16); 
      window.addEventListener('resize', updatePath);
      const timeout = setTimeout(() => clearInterval(interval), 600);
      return () => {
        clearInterval(interval);
        clearTimeout(timeout);
        window.removeEventListener('resize', updatePath);
      };
    }
  }, [activePopup, filterMonth, filterModel, filterMIS]);

  const handleImageUploadRequest = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setPendingFile(file);
    setCustomImageName(file.name.split('.')[0]);
    setModalType('name');
  };

  const confirmImageUpload = async () => {
    if (!pendingFile || !userId) return;
    const formData = new FormData();
    formData.append('image', pendingFile);
    setIsLoading(true);
    setModalType(null);
    try {
      const res = await fetch(`${API_BASE}/upload?userId=${userId}&displayName=${encodeURIComponent(customImageName || pendingFile.name)}`, { method: 'POST', body: formData });
      const data = await res.json();
      setSelectedImage(data);
      setLabels([]);
      fetchImages();
    } catch (err) {
      console.error("Upload failed", err);
    } finally {
      setIsLoading(false);
      setPendingFile(null);
    }
  };

  const requestDeleteImage = (e, imageId) => {
    e.stopPropagation();
    setModalTypeData(imageId);
    setModalType('delete-image');
  };

  const confirmDeleteImage = async () => {
    if (!userId) return;
    const imageId = modalData;
    try {
      await fetch(`${API_BASE}/images/${imageId}?userId=${userId}`, { method: 'DELETE' });
      setImages(images.filter(img => img.id !== imageId));
      if (selectedImage?.id === imageId) {
        setSelectedImage(null);
        setLabels([]);
        setActivePopup(null);
      }
    } catch (err) {
      console.error("Delete failed", err);
    } finally {
      setModalType(null);
    }
  };

  const requestDeleteLabel = (id) => {
    setModalTypeData(id);
    setModalType('delete-part');
  };

  const confirmDeleteLabel = async () => {
    if (!userId) return;
    const id = modalData;
    try {
      await fetch(`${API_BASE}/labels/${id}?userId=${userId}`, { method: 'DELETE' });
      setLabels(labels.filter(l => l.id !== id));
      if (activePopup?.id === id) setActivePopup(null);
    } catch (err) {
      console.error("Delete part failed", err);
    } finally {
      setModalType(null);
    }
  };

  const handleImageClick = (e) => {
    if (!selectedImage) return;
    if (activePopup) {
      setActivePopup(null);
      return;
    }
    const rect = imgRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setShowInput({ x, y });
  };

  const handleMarkerClick = async (label) => {
    if (!userId) return;
    setActivePopup(label);
    setIsEditingLabel(false);
    setEditLabelName(label.partName);
    setWarrantyHistory([]); 
    setShowInput(null); 
    fetchActivePartHistory(label);
    fetchDashboardData(label.partName);
  };

  const handleUpdateLabel = async () => {
    if (!editLabelName.trim() || !userId) return;
    try {
      await fetch(`${API_BASE}/labels/${activePopup.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partName: editLabelName, userId })
      });
      fetchLabels(selectedImage.id);
      setActivePopup({ ...activePopup, partName: editLabelName });
      setIsEditingLabel(false);
    } catch (err) {
      alert("Failed to update marker");
    }
  };

  const calculateNonOverlappingPositions = (currentLabels) => {
    let nodes = currentLabels.map((l, i) => {
      const isLeft = l.x < 50;
      const isTop = l.y < 50;
      return {
        ...l,
        vx: 0, vy: 0,
        x: l.x + (isLeft ? -20 : 20) + ((i % 2) * 5),
        y: l.y + (isTop ? -15 : 15) + ((i % 3) * 5),
        originalIndex: i
      };
    });
    const ITERATIONS = 120;
    const REPULSION_RADIUS = 15; 
    const SCREEN_PADDING = 8;
    for (let iter = 0; iter < ITERATIONS; iter++) {
      for (let i = 0; i < nodes.length; i++) {
        let node = nodes[i];
        const dx = currentLabels[i].x - node.x;
        const dy = currentLabels[i].y - node.y;
        node.vx += dx * 0.03;
        node.vy += dy * 0.03;
        for (let j = 0; j < nodes.length; j++) {
          if (i === j) continue;
          let other = nodes[j];
          let diffX = node.x - other.x;
          let diffY = node.y - other.y;
          let dist = Math.sqrt(diffX*diffX + diffY*diffY);
          if (dist < REPULSION_RADIUS) {
            let force = (REPULSION_RADIUS - dist) * 0.5;
            let angle = Math.atan2(diffY, diffX);
            node.vx += Math.cos(angle) * force;
            node.vy += Math.sin(angle) * force;
          }
        }
        let mDist = Math.sqrt(dx*dx + dy*dy);
        if (mDist < 12) {
           let angle = Math.atan2(-dy, -dx);
           node.vx += Math.cos(angle) * 1.5;
           node.vy += Math.sin(angle) * 1.5;
        }
      }
      for (let node of nodes) {
        node.x += node.vx;
        node.y += node.vy;
        node.vx *= 0.6; 
        node.vy *= 0.6;
        node.x = Math.max(SCREEN_PADDING, Math.min(100 - SCREEN_PADDING, node.x));
        node.y = Math.max(SCREEN_PADDING, Math.min(100 - SCREEN_PADDING, node.y));
      }
    }
    return nodes.map(n => ({ x: n.x, y: n.y }));
  };

  const handleShowAll = async () => {
    if (!selectedImage || !userId) return;
    if (isSummaryActive) {
      setIsSummaryActive(false);
      return;
    }
    setIsLoading(true);
    const calculatedPositions = calculateNonOverlappingPositions(labels);
    setNodePositions(calculatedPositions);
    setIsSummaryActive(true); 
    setIsLoading(false);
    fetchDashboardData(null);
  };

  const saveLabel = async () => {
    if (!partName.trim() || !userId) return;
    const newLabel = { imageId: selectedImage.id, partName, x: showInput.x, y: showInput.y, userId };
    try {
      await fetch(`${API_BASE}/labels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newLabel),
      });
      fetchLabels(selectedImage.id);
      resetForm();
    } catch (err) {
      alert("Failed to save label");
    }
  };

  const resetForm = () => {
    setPartName('');
    setShowInput(null);
  };

  // ── Agent panel helpers ───────────────────────────────────────────────
  const AGENT_WELCOME = 'Hi! I\'m your Part Labeler Dashboard Assistant. Ask me about warranty, RPT, GNOVAC, RFI, or e-SQA data.';

  const scrollAgentToBottom = () => {
    setTimeout(() => {
      if (agentPanelBodyRef.current) {
        agentPanelBodyRef.current.scrollTop = agentPanelBodyRef.current.scrollHeight;
      }
    }, 30);
  };

  const resetAgentChat = () => {
    if (agentWsRef.current) { agentWsRef.current.close(); agentWsRef.current = null; }
    setAgentConvId(null);
    setAgentMessages([{ id: 'welcome', sender: 'bot', text: AGENT_WELCOME }]);
    agentMessagesRef.current = [];
    setAgentInput('');
    setAgentLoading(false);
    setAgentThinkingSteps([]);
    setAgentStreamingText('');
    setAgentThinkingOpen(false);
  };

  const loadAgentHistory = async () => {
    const uid = userId || parseInt(sessionStorage.getItem('user_id'), 10) || 1;
    setAgentHistoryLoading(true);
    try {
      const res = await fetch(`${backend_url}/conversations/user/${uid}/history?agent_type=part_labeler_dashboard`);
      const data = await res.json();
      const list = (data.response || []).map(c => ({
        id: c.conversation_id,
        title: c.chat_title || 'Untitled',
        date: c.creation_ts ? new Date(c.creation_ts) : null,
      }));
      setAgentHistory(list);
    } catch (e) {
      console.error('Failed to load agent history', e);
    } finally {
      setAgentHistoryLoading(false);
    }
  };

  const selectAgentConversation = async (convId) => {
    try {
      const res = await fetch(`${backend_url}/conversations/${convId}`);
      const data = await res.json();
      const conv = data.response;
      const loaded = [{ id: 'welcome', sender: 'bot', text: AGENT_WELCOME }];
      if (conv?.query_responses) {
        conv.query_responses.forEach(item => {
          loaded.push({ id: `u-${item.message_id}`, sender: 'user', text: item.query });
          let txt = 'No response';
          let chartData;
          try {
            const r = typeof item.response === 'string' ? JSON.parse(item.response) : item.response;
            txt = r?.response || r?.text || r?.content || (typeof r === 'string' ? r : JSON.stringify(r));
            chartData = r?.chart_data || undefined;
          } catch { txt = String(item.response); }
          loaded.push({ id: `b-${item.message_id}`, sender: 'bot', text: txt, ...(chartData && { chart_data: chartData }) });
        });
      }
      setAgentMessages(loaded);
      agentMessagesRef.current = loaded;
      setAgentConvId(convId);
      if (agentWsRef.current) { agentWsRef.current.close(); agentWsRef.current = null; }
      setAgentView('chat');
      scrollAgentToBottom();
    } catch (e) {
      console.error('Failed to load agent conversation', e);
    }
  };

  const openAgentPanel = () => {
    setShowAgentPanel(true);
    setAgentView('chat');
    if (agentMessages.length === 0) {
      setAgentMessages([{ id: 'welcome', sender: 'bot', text: AGENT_WELCOME }]);
    }
  };

  const closeAgentPanel = () => {
    setShowAgentPanel(false);
    if (agentWsRef.current) { agentWsRef.current.close(); agentWsRef.current = null; }
  };

  const handleAgentWsMessage = (data) => {
    if (data.type === 'keepalive') {
      // Server-side ping to keep connection alive — no UI action needed
      return;
    }

    if (data.type === 'progress') {
      const stage = data.stage || '';
      if (stage === 'generating') {
        setAgentProgress({
          stage: 'generating',
          detail: `Generating response…`,
          stepCount: data.step_count || 0,
        });
      } else if (stage === 'retrying') {
        setAgentProgress({
          stage: 'retrying',
          detail: 'Agent retrying — generating final answer…',
          stepCount: 0,
        });
      }
      return;
    }

    if (data.type === 'thinking' || data.type === 'thinking_token') {
      const content = data.content || '';
      const step = (data.step || '').toLowerCase();
      // Skip the backend boilerplate "Processing your query…" initialization line
      if (!content.trim() || step === 'initialization') return;
      setAgentProgress({ stage: 'thinking', detail: `Thinking…`, stepCount: 0 });
      setAgentThinkingSteps(prev => {
        if (prev.some(s => s.content?.trim() === content.trim())) return prev;
        return [...prev, { step: data.step || 'Reasoning', content }];
      });
    } else if (data.type === 'chart') {
      // Store chart data — will be attached to the final bot message
      agentPendingChartRef.current = data.chart_data || null;
    } else if (data.type === 'token') {
      setAgentStreamingText(prev => prev + (data.content || ''));
      scrollAgentToBottom();
    } else if (data.type === 'final' || data.type === 'error') {
      setAgentLoading(false);
      setAgentProgress(null);
      const finalText = data.type === 'error'
        ? `⚠️ ${data.content}`
        : data.content || agentStreamingText;
      setAgentStreamingText('');
      const botMsg = {
        id: `bot-${Date.now()}`,
        sender: 'bot',
        text: finalText,
        isError: data.type === 'error',
        // Attach chart: prefer ref (from chart event), fall back to chart_data embedded in final event
        chart_data: agentPendingChartRef.current || data.chart_data || undefined,
      };
      agentPendingChartRef.current = null;
      setAgentMessages(prev => {
        const updated = [...prev, botMsg];
        agentMessagesRef.current = updated;
        return updated;
      });
      scrollAgentToBottom();
      // refresh history so new chat title appears
      loadAgentHistory();
    }
  };

  const handleAgentSend = async () => {
    const text = agentInput.trim();
    if (!text || agentLoading) return;
    setAgentInput('');
    setAgentThinkingSteps([]);
    setAgentThinkingOpen(false);
    setAgentProgress(null);
    agentPendingChartRef.current = null;

    const userMsg = { id: `user-${Date.now()}`, sender: 'user', text };
    setAgentMessages(prev => { const u = [...prev, userMsg]; agentMessagesRef.current = u; return u; });
    setAgentLoading(true);
    scrollAgentToBottom();

    let convId = agentConvId;
    try {
      if (!convId) {
        const res = await fetch(`${backend_url}/conversations/initiate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: userId || parseInt(sessionStorage.getItem('user_id'), 10) || 1,
            agent_type: 'part_labeler_dashboard',
          }),
        });
        const d = await res.json();
        convId = d.conversationId;
        setAgentConvId(convId);
      }

      if (!agentWsRef.current || agentWsRef.current.readyState !== WebSocket.OPEN) {
        const ws = new WebSocket(`${backend_url_ws}/conversations/${convId}/ws`);
        agentWsRef.current = ws;
        await new Promise((resolve, reject) => {
          const t = setTimeout(() => reject(new Error('WS timeout')), 5000);
          ws.onopen = () => { clearTimeout(t); resolve(); };
          ws.onerror = () => { clearTimeout(t); reject(new Error('WS error')); };
        });
        ws.onmessage = (e) => { try { handleAgentWsMessage(JSON.parse(e.data)); } catch {} };
        ws.onclose = () => { setAgentLoading(false); };
      }

      agentWsRef.current.send(JSON.stringify({
        user_id: userId || parseInt(sessionStorage.getItem('user_id'), 10) || 1,
        user_message: text,
        agent_type: 'part_labeler_dashboard',
      }));
    } catch (err) {
      setAgentLoading(false);
      setAgentMessages(prev => [...prev, { id: `err-${Date.now()}`, sender: 'bot', text: 'Failed to send. Please try again.', isError: true }]);
    }
  };

  const currentMonthFailures = filterMonth.includes('All')
    ? warrantyHistory.reduce((sum, item) => sum + item.failureCount, 0)
    : warrantyHistory.filter(h => filterMonth.includes(h.month)).reduce((sum, item) => sum + item.failureCount, 0);

  const currentDescription = (() => {
    if (!filterMonth.includes('All')) {
      const match = warrantyHistory.find(h => filterMonth.includes(h.month));
      if (match) return match.description;
    }
    if (!warrantyHistory || warrantyHistory.length === 0) return 'Aggregated warranty claims data.';
    const descWeights = {};
    const relevantHistory = filterMonth.includes('All') ? warrantyHistory : warrantyHistory.filter(h => filterMonth.includes(h.month));
    relevantHistory.forEach(h => {
      const d = h.description;
      if (d && d !== '-' && d !== 'null') descWeights[d] = (descWeights[d] || 0) + h.failureCount;
    });
    let topDesc = 'Aggregated warranty claims data.';
    let maxWeight = -1;
    Object.entries(descWeights).forEach(([desc, weight]) => {
      if (weight > maxWeight) {
        maxWeight = weight;
        topDesc = desc;
      }
    });
    return topDesc;
  })();

  return (
    <div className="part-labeler">
      <AnimatePresence>
        {modalType && (
          <div className="custom-modal-overlay">
            <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }} className="custom-modal-card">
              <div className="modal-header">
                <h3>
                  {modalType === 'name' && 'New CAD Drawing'}
                  {modalType === 'delete-image' && 'Delete Drawing?'}
                  {modalType === 'delete-part' && 'Delete Part?'}
                  {modalType === 'ingest-all-overview' && 'Ingest All Sources'}
                  {modalType === 'ingest-start' && `Ingest ${ingestConfig.label}`}
                  {modalType === 'ingest-mapping' && 'Map Columns'}
                  {modalType === 'ingest-success' && 'Success'}
                </h3>
                <button onClick={() => setModalType(null)}><X size={18} /></button>
              </div>
              <div className="modal-body">
                {modalType === 'name' && (
                  <div className="modal-input-group">
                    <label>Enter a display name for this CAD:</label>
                    <input type="text" value={customImageName} onChange={(e) => setCustomImageName(e.target.value)} placeholder="e.g. THAR ROXX - Interior" autoFocus />
                  </div>
                )}
                {modalType === 'ingest-all-overview' && (
                  <div className="ingest-all-overview">
                    <p className="ingest-all-hint">Upload data for each source. Click <strong>Upload</strong> next to a source to add its data file.</p>
                    <table className="ingest-sources-table">
                      <thead>
                        <tr><th>Data Source</th><th>Status</th><th></th></tr>
                      </thead>
                      <tbody>
                        {REAL_SOURCES.map(src => (
                          <tr key={src}>
                            <td>{DATA_SOURCES[src].label}</td>
                            <td>
                              {sourceDataStatus[src] === undefined ? (
                                <span className="status-checking">Checking…</span>
                              ) : sourceDataStatus[src] ? (
                                <span className="status-ok"><Check size={13} /> Data Available</span>
                              ) : (
                                <span className="status-missing">No Data</span>
                              )}
                            </td>
                            <td>
                              <button className="upload-source-btn" onClick={() => handleIngestForSource(src)}>
                                <Upload size={13} /> {sourceDataStatus[src] ? 'Replace' : 'Upload'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {modalType === 'delete-image' && <p>Are you sure you want to delete this drawing? This action will remove all mapped parts permanently.</p>}
                {modalType === 'delete-part' && <p>Are you sure you want to remove this component marker?</p>}
                {modalType === 'ingest-start' && (
                  <div className="ingest-start-modal">
                    {isLoading ? (
                      <div className="ingest-loading">
                        <div className="ingest-spinner" />
                        <div className="ingest-progress-bar"><div className="ingest-progress-fill" /></div>
                        <p>Uploading &amp; parsing file…</p>
                      </div>
                    ) : (
                      <div className="upload-zone-compact" onClick={() => warrantyInputRef.current.click()}>
                        <Upload size={32} />
                        <p>Select your Excel or CSV warranty file to begin mapping.</p>
                        <input type="file" ref={warrantyInputRef} style={{ display: 'none' }} onChange={handleDataIngestionFile} accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" />
                      </div>
                    )}
                  </div>
                )}
                {modalType === 'ingest-mapping' && (
                  <div className="ingest-mapping-container">
                    {isLoading && (
                      <div className="ingest-loading-overlay">
                        <div className="ingest-spinner" />
                        <div className="ingest-progress-bar"><div className="ingest-progress-fill" /></div>
                        <p>Processing &amp; loading data…</p>
                      </div>
                    )}
                    <div className="ingest-notice">
                      <FileSpreadsheet size={20} />
                      <p>Mapping for <strong>{ingestConfig.label}</strong>. <strong>{mandatoryColumns.length} Required fields (*) must be set.</strong></p>
                    </div>
                    <div className="mapping-scroll-table">
                      <table className="mapping-table">
                        <thead><tr><th>Internal Field</th><th>Excel Column</th></tr></thead>
                        <tbody>
                          {[...new Set(targetColumns.map(c => c.group))].map(group => (
                            <React.Fragment key={group}>
                              <tr className="group-header-row"><td colSpan="2">{group} Fields</td></tr>
                              {targetColumns.filter(tc => tc.group === group).map(col => (
                                <tr key={col.key}>
                                  <td className={col.mandatory ? 'mandatory-cell' : ''}>
                                    {col.label} {col.mandatory && <span className="req">*</span>}
                                    {col.hint && <span className="col-hint"> ({col.hint})</span>}
                                  </td>
                                  <td>
                                    <select value={columnMapping[col.key] || ''} onChange={(e) => setColumnMapping({ ...columnMapping, [col.key]: e.target.value })}>
                                      <option value="">-- Discard / Skip --</option>
                                      {excelHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                                    </select>
                                  </td>
                                </tr>
                              ))}
                            </React.Fragment>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                {modalType === 'ingest-success' && (
                  <div className="ingest-success-view">
                    <div className="success-icon-circle-large"><Check size={48} /></div>
                    <h3>Data Load Successful</h3>
                    <p>Successfully processed and loaded <strong>{ingestResult}</strong> {ingestConfig.label} records.</p>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                {modalType === 'ingest-success' ? (
                  <button className="modal-btn-confirm success-btn" onClick={() => {
                    if (dataSource === 'all' && ingestingForSource) {
                      setIngestingForSource(null);
                      checkAllSourcesStatus();
                      setModalType('ingest-all-overview');
                    } else {
                      setModalType(null);
                    }
                  }}>Close</button>
                ) : (
                  <>
                    <button className="modal-btn-cancel" onClick={() => setModalType(null)}>Cancel</button>
                    {modalType !== 'ingest-start' && modalType !== 'ingest-all-overview' && (
                      <button className={`modal-btn-confirm ${modalType.includes('delete') ? 'danger' : ''} ${modalType === 'ingest-mapping' ? 'success-btn' : ''}`}
                        onClick={() => {
                          if (modalType === 'name') confirmImageUpload();
                          if (modalType === 'delete-image') confirmDeleteImage();
                          if (modalType === 'delete-part') confirmDeleteLabel(modalData);
                          if (modalType === 'ingest-mapping') confirmMappingAndProcess(userId);
                        }}
                        disabled={isLoading}
                      >
                        {modalType === 'name' && 'Upload Drawing'}
                        {modalType.includes('delete') && 'Confirm Delete'}
                        {modalType === 'ingest-mapping' && (isLoading ? 'Processing...' : 'Verify & Load Data')}
                      </button>
                    )}
                  </>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="part-labeler-header">
        <div className="header-title">
          <div>
            <h1>{isPlantMode ? 'Part Sense Visualizer Plant' : 'Part Sense Visualizer'}</h1>
            <p>Interactive failure trend analysis</p>
          </div>
        </div>
        <div className="header-stats">
          <div className="stat-card">
            <span className="stat-value">{labels.length}</span>
            <span className="stat-label">Mapped Components</span>
          </div>
          <button
            className={`agent-toggle-btn ${showAgentPanel ? 'active' : ''}`}
            onClick={showAgentPanel ? closeAgentPanel : openAgentPanel}
            title="Open Dashboard Agent"
          >
            <Bot size={18} />
            <span>Agent</span>
          </button>
          <img src={utilityLogo} alt="Mahindra Utility Logo" className="header-corner-logo" />
        </div>
      </div>

      <div className={`part-labeler-content ${showAgentPanel ? 'agent-panel-open' : ''}`}>
        <aside className="part-labeler-sidebar">
          <button className="sidebar-back-btn" onClick={() => navigate('/')}><ArrowLeft size={16} /><span>Dashboard</span></button>
          <div className="sidebar-section">
            <h3 className="section-title">Operations</h3>
            <button className="sidebar-btn primary" onClick={() => cadInputRef.current.click()}>
              <Upload size={18} /><span>Upload New CAD</span>
              <input type="file" ref={cadInputRef} style={{ display: 'none' }} onChange={handleImageUploadRequest} accept="image/*" />
            </button>
            <button className="sidebar-btn secondary" onClick={handleDataIngestionStart}><Database size={18} /><span>Ingest {sourceConfig.label}</span></button>
            <button className={`sidebar-btn secondary ${isSummaryActive ? 'active' : ''}`} onClick={handleShowAll} disabled={isLoading || !selectedImage}>
              <BarChart2 size={18} /><span>{isSummaryActive ? 'Hide Visuals' : 'Show Visuals'}</span>
            </button>
          </div>
          <div className="sidebar-section">
            <h3 className="section-title">CAD Drawings</h3>
            <div className="image-list">
              {Array.isArray(images) && images.map(img => (
                <div key={img.id} className="image-group-container">
                  <div className={`image-item ${selectedImage?.id === img.id ? 'active' : ''}`}
                    onClick={() => { setSelectedImage(img); setShowInput(null); setActivePopup(null); setExpandedImageId(expandedImageId === img.id ? null : img.id); }}>
                    <MapPin size={14} /><span className="image-display-name">{img.display_name}</span>
                    <div className="image-item-actions">
                      <button onClick={(e) => requestDeleteImage(e, img.id)} className="delete-image-btn"><Trash2 size={12} /></button>
                      {expandedImageId === img.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </div>
                  </div>
                  <AnimatePresence>
                    {expandedImageId === img.id && selectedImage?.id === img.id && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="sidebar-parts-dropdown">
                        {labels.length > 0 ? labels.map((label, idx) => (
                          <div key={label.id} className="sidebar-part-entry">
                            <span className="entry-index">{idx + 1}</span>
                            <span className="entry-name" onClick={(e) => { e.stopPropagation(); handleMarkerClick(label); }}>{label.partName}</span>
                            <div className="entry-actions">
                              <button onClick={(e) => { e.stopPropagation(); handleMarkerClick(label); }} title="Edit"><Edit2 size={12} /></button>
                              <button onClick={(e) => { e.stopPropagation(); requestDeleteLabel(label.id); }} title="Delete"><Trash2 size={12} /></button>
                            </div>
                          </div>
                        )) : <div className="empty-parts-msg">No parts mapped yet</div>}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
              {(!images || images.length === 0) && <p className="empty-msg">No drawings uploaded</p>}
            </div>
          </div>

          {/* User profile footer */}
          <div className="pl-sidebar-footer">
            <div className="pl-user-profile">
              <div className="pl-user-avatar">
                <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                </svg>
              </div>
              <span className="pl-user-name">{currentUsername}</span>
            </div>
            <div className="pl-settings-wrapper" ref={settingsMenuRef}>
              <button className="pl-settings-btn" onClick={() => setShowSettingsMenu(!showSettingsMenu)} title="Settings">
                <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                  <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z" />
                </svg>
              </button>
              {showSettingsMenu && (
                <div className="pl-settings-menu">
                  <button className="pl-settings-menu-item" onClick={handleLogout}>
                    <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                      <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z" />
                    </svg>
                    <span>Logout</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </aside>

        <main className="part-labeler-workspace">
          <div className="workspace-header-bar">
            {isPlantMode ? (
              <DataSourceSelector current={dataSource} onChange={handleDataSourceChange} />
            ) : (
              prefix && (
                <div className="prefix-filter-field">
                  <span className="prefix-label">Prefix:</span>
                  <span className="prefix-value">{prefix}</span>
                </div>
              )
            )}
            {(dataSource !== 'all' || allModeActiveSource) && ['month', 'qtr', 'model', 'mis'].map(type => {
              const label = type === 'month' ? 'Mfg Month' : type === 'qtr' ? 'Mfg Qtr' : type === 'model' ? 'Model' : 'MIS';
              const options = type === 'month' ? filterOptions.mfg_months : 
                              type === 'qtr' ? filterOptions.mfg_quarters :
                              type === 'model' ? filterOptions.models :
                              filterOptions.mis_buckets;
              const currentArr = type === 'month' ? filterMonth : type === 'qtr' ? filterMfgQtr : type === 'model' ? filterModel : filterMIS;
              const setter = type === 'month' ? setFilterMonth : type === 'qtr' ? setFilterMfgQtr : type === 'model' ? setFilterModel : setFilterMIS;

              const displayValue = currentArr.includes('All') 
                ? (type === 'month' ? 'All Months' : type === 'qtr' ? 'All Quarters' : 'All')
                : (currentArr.length === 1 ? currentArr[0] : `${currentArr.length} selected`);

              const handleToggle = (opt) => {
                if (opt === 'All') {
                  setter(['All']);
                  return;
                }
                let newArr = currentArr.filter(v => v !== 'All');
                if (newArr.includes(opt)) {
                  newArr = newArr.filter(v => v !== opt);
                  if (newArr.length === 0) newArr = ['All'];
                } else {
                  newArr.push(opt);
                }
                setter(newArr);
              };

              return (
                <div key={type} className={`month-filter-compact ${openFilter === type ? 'open' : ''}`} onClick={() => setOpenFilter(openFilter === type ? null : type)}>
                  <Layout size={16} /><span>{label}:</span><div className="selected-value">{displayValue}</div>
                  <ChevronDown size={14} className={`chevron ${openFilter === type ? 'rotate' : ''}`} />
                  {openFilter === type && (
                    <div className="filter-dropdown-list" onClick={(e) => e.stopPropagation()}>
                      <div className={`filter-option ${currentArr.includes('All') ? 'selected' : ''}`} 
                           onClick={() => handleToggle('All')}>
                        {type === 'month' ? 'All Months' : type === 'qtr' ? 'All Quarters' : 'All'}
                      </div>
                      {options.map(opt => (
                        <div key={opt} className={`filter-option ${currentArr.includes(opt) ? 'selected' : ''}`} 
                             onClick={() => handleToggle(opt)}>
                          {opt}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {(dataSource !== 'all' || allModeActiveSource) && (allModeActiveSource?.src || dataSource) === 'rfi' && (() => {
              const rfiFilters = [
                {
                  key: 'defectType',
                  label: 'Defect Type',
                  options: filterOptions.defect_types || [],
                  currentArr: filterDefectType,
                  setter: setFilterDefectType,
                  allLabel: 'All Types',
                },
              ];
              return rfiFilters.map(({ key, label, options, currentArr, setter, allLabel }) => {
                const displayValue = currentArr.includes('All')
                  ? allLabel
                  : currentArr.length === 1 ? currentArr[0] : `${currentArr.length} selected`;
                const handleToggle = (opt) => {
                  if (opt === 'All') { setter(['All']); return; }
                  let newArr = currentArr.filter(v => v !== 'All');
                  if (newArr.includes(opt)) {
                    newArr = newArr.filter(v => v !== opt);
                    if (newArr.length === 0) newArr = ['All'];
                  } else {
                    newArr.push(opt);
                  }
                  setter(newArr);
                };
                return (
                  <div key={key} className={`month-filter-compact ${openFilter === key ? 'open' : ''}`} onClick={() => setOpenFilter(openFilter === key ? null : key)}>
                    <Layout size={16} /><span>{label}:</span><div className="selected-value">{displayValue}</div>
                    <ChevronDown size={14} className={`chevron ${openFilter === key ? 'rotate' : ''}`} />
                    {openFilter === key && (
                      <div className="filter-dropdown-list" onClick={(e) => e.stopPropagation()}>
                        <div className={`filter-option ${currentArr.includes('All') ? 'selected' : ''}`} onClick={() => handleToggle('All')}>
                          {allLabel}
                        </div>
                        {options.map(opt => (
                          <div key={opt} className={`filter-option ${currentArr.includes(opt) ? 'selected' : ''}`} onClick={() => handleToggle(opt)}>
                            {opt}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              });
            })()}
            {(dataSource !== 'all' || allModeActiveSource) && (allModeActiveSource?.src || dataSource) === 'rpt' && (() => {
              const rptFilters = [
                {
                  key: 'buyoff',
                  label: 'Buyoff Stage',
                  options: filterOptions.buyoff_stages || [],
                  currentArr: filterBuyoffStage,
                  setter: setFilterBuyoffStage,
                  allLabel: 'All Stages',
                },
                {
                  key: 'onlineOffline',
                  label: 'Online/Offline',
                  options: filterOptions.online_offline_options || [],
                  currentArr: filterOnlineOffline,
                  setter: setFilterOnlineOffline,
                  allLabel: 'All',
                },
              ];
              return rptFilters.map(({ key, label, options, currentArr, setter, allLabel }) => {
                const displayValue = currentArr.includes('All')
                  ? allLabel
                  : currentArr.length === 1 ? currentArr[0] : `${currentArr.length} selected`;
                const handleToggle = (opt) => {
                  if (opt === 'All') { setter(['All']); return; }
                  let newArr = currentArr.filter(v => v !== 'All');
                  if (newArr.includes(opt)) {
                    newArr = newArr.filter(v => v !== opt);
                    if (newArr.length === 0) newArr = ['All'];
                  } else {
                    newArr.push(opt);
                  }
                  setter(newArr);
                };
                return (
                  <div key={key} className={`month-filter-compact ${openFilter === key ? 'open' : ''}`} onClick={() => setOpenFilter(openFilter === key ? null : key)}>
                    <Layout size={16} /><span>{label}:</span><div className="selected-value">{displayValue}</div>
                    <ChevronDown size={14} className={`chevron ${openFilter === key ? 'rotate' : ''}`} />
                    {openFilter === key && (
                      <div className="filter-dropdown-list" onClick={(e) => e.stopPropagation()}>
                        <div className={`filter-option ${currentArr.includes('All') ? 'selected' : ''}`} onClick={() => handleToggle('All')}>
                          {allLabel}
                        </div>
                        {options.map(opt => (
                          <div key={opt} className={`filter-option ${currentArr.includes(opt) ? 'selected' : ''}`} onClick={() => handleToggle(opt)}>
                            {opt}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              });
            })()}
          </div>

          <div className={`workspace-scroll-container ${!selectedImage ? 'empty-state' : ''}`}>
            <div className="top-visual-section">
              {!selectedImage ? (
                <div className="upload-prompt">
                  <div className="upload-icon-circle"><Upload size={48} /></div>
                  <h2>Start Component Mapping</h2>
                  <p>Upload a CAD drawing or select an existing one to begin.</p>
                  <button className="main-upload-btn" onClick={() => cadInputRef.current.click()}>Select Drawing</button>
                </div>
              ) : (
                <div className="layout-grid-top">
                  <div className="cad-viewer-container">
                    <div className="cad-viewer centering">
                      <div className="image-wrapper">
                        <div className="cad-img-container" ref={imgRef} onClick={handleImageClick}>
                          <img src={`${UPLOAD_BASE}/${selectedImage.filename}`} alt="CAD Drawing" className="cad-img" />
                          {labels.map((label, index) => (
                            <React.Fragment key={label.id}>
                              <div className={`label-marker ${activePopup?.id === label.id ? 'active' : ''}`}
                                onClick={(e) => { e.stopPropagation(); handleMarkerClick(label); }}
                                style={{ left: `${label.x}%`, top: `${label.y}%` }}>{index + 1}</div>
                              {isSummaryActive && nodePositions[index] && (
                                <DraggableNode
                                  label={label}
                                  initialPos={nodePositions[index]}
                                  count={
                                    dataSource === 'all' && allModeActiveSource
                                      ? (labelFailuresBySource[label.id]?.[allModeActiveSource.src] || 0)
                                      : dataSource === 'all'
                                      ? Object.values(labelFailuresBySource[label.id] || {}).reduce((s, v) => s + v, 0)
                                      : (labelFailures[label.id] || 0)
                                  }
                                />
                              )}
                            </React.Fragment>
                          ))}
                          <AnimatePresence>
                            {showInput && (
                              <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="marker-input-popup"
                                style={{ left: `${showInput.x}%`, top: `${showInput.y}%` }} onClick={(e) => e.stopPropagation()}>
                                <div className="popup-header"><h4>New Component</h4><button onClick={resetForm}><X size={14} /></button></div>
                                <div className="popup-body">
                                  <input type="text" placeholder="Part Name" autoFocus value={partName} onChange={(e) => setPartName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveLabel()} />
                                  <button className="save-btn" onClick={saveLabel}>Save Position</button>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="side-data-panel">
                    <div className="mapped-parts-integrated">
                      <div className="panel-header"><Layers size={16} /><span>Mapped Components</span></div>
                      <div className="panel-table-scroll">
                        {dataSource === 'all' ? (
                          <table className="integrated-table all-sources-table">
                            <thead>
                              <tr>
                                <th>#</th>
                                <th>Component Name</th>
                                <th style={{ textAlign: 'right' }}>Warranty</th>
                                <th style={{ textAlign: 'right' }}>RPT</th>
                                <th style={{ textAlign: 'right' }}>GNOVAC</th>
                                <th style={{ textAlign: 'right' }}>RFI</th>
                                <th style={{ textAlign: 'right' }}>e-SQA</th>
                                <th style={{ textAlign: 'right' }}>Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {labels.map((label, idx) => {
                                const srcCounts = labelFailuresBySource[label.id] || {};
                                const total = (srcCounts.warranty || 0) + (srcCounts.rpt || 0) + (srcCounts.gnovac || 0) + (srcCounts.rfi || 0) + (srcCounts.esqa || 0);
                                const isActive = allModeActiveSource?.label?.id === label.id;
                                return (
                                  <tr key={label.id} className={isActive ? 'active-row-all' : ''}>
                                    <td>{idx + 1}</td>
                                    <td className="part-name-cell">{label.partName}</td>
                                    {['warranty', 'rpt', 'gnovac', 'rfi', 'esqa'].map(s => (
                                      <td
                                        key={s}
                                        className={`source-count-cell ${isActive && allModeActiveSource?.src === s ? 'active-source-cell' : ''}`}
                                        style={{ textAlign: 'right', fontWeight: 700, cursor: 'pointer' }}
                                        onClick={() => handleAllModeSourceClick(label, s)}
                                        title={`View ${DATA_SOURCES[s].label} charts for ${label.partName}`}
                                      >
                                        {srcCounts[s] || 0}
                                      </td>
                                    ))}
                                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--mahindra-red)' }}>{total}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        ) : (
                          <table className="integrated-table">
                            <thead><tr><th>#</th><th>Component Name</th><th style={{ textAlign: 'right' }}>Failures</th></tr></thead>
                            <tbody>
                              {labels.map((label, idx) => (
                                <tr key={label.id} className={activePopup?.id === label.id ? 'active-row' : ''} onClick={() => handleMarkerClick(label)}>
                                  <td>{idx + 1}</td><td className="part-name-cell">{label.partName}</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{labelFailures[label.id] || 0}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </div>
                                        <AnimatePresence>
                                          {activePopup && (
                                            <motion.div 
                                              initial={{ opacity: 0, y: 10 }}
                                              animate={{ opacity: 1, y: 0 }}
                                              className="active-part-details"
                                            >
                                              <div className="details-header">
                                                {isEditingLabel ? (
                                                  <div className="edit-mode-compact">
                                                    <input 
                                                      type="text" 
                                                      value={editLabelName} 
                                                      onChange={(e) => setEditLabelName(e.target.value)}
                                                      autoFocus
                                                      onKeyDown={(e) => e.key === 'Enter' && handleUpdateLabel()}
                                                    />
                                                    <div className="edit-actions">
                                                      <button onClick={handleUpdateLabel} className="success"><Check size={14} /></button>
                                                      <button onClick={() => setIsEditingLabel(false)} className="cancel"><X size={14} /></button>
                                                    </div>
                                                  </div>
                                                ) : (
                                                  <>
                                                    <div className="title-row">
                                                      <h3 className="mahindra-red-text">{activePopup.partName}</h3>
                                                      <div className="actions">
                                                        <button onClick={() => setIsEditingLabel(true)} title="Edit name"><Edit2 size={14} /></button>
                                                        <button onClick={() => requestDeleteLabel(activePopup.id)} title="Delete"><Trash2 size={14} /></button>
                                                        <button onClick={() => setActivePopup(null)} title="Close"><X size={14} /></button>
                                                      </div>
                                                    </div>
                                                    <div className="primary-concern-row">
                                                      <strong>Primary Concern:</strong>
                                                      <p>{currentDescription}</p>
                                                    </div>
                                                  </>
                                                )}
                                              </div>
                          <div className="details-summary-stats">
                            <div className="mini-stat">
                              <span className="label">
                                {filterMonth.includes('All') ? 'ANNUAL' : (filterMonth.length === 1 ? filterMonth[0] : 'Multiple')}
                              </span>
                              <span className="value">{currentMonthFailures}</span><span className="sub">Failures</span>
                            </div>
                            <button className="download-csv-btn-integrated" onClick={() => {
                              const params = new URLSearchParams();
                              params.append('userId', userId);
                              params.append('partName', activePopup.partName);
                              filterMonth.forEach(m => params.append('month', m));
                              filterModel.forEach(m => params.append('baseModel', m));
                              filterMIS.forEach(m => params.append('misBucket', m));
                              filterMfgQtr.forEach(m => params.append('mfgQtr', m));
                              window.open(`${API_BASE}/download-warranty?${params.toString()}`, '_blank');
                            }}><Download size={14} /><span>Download Data</span></button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              )}
            </div>

            {selectedImage && activePopup && (dataSource !== 'all' || allModeActiveSource) && (() => {
              const viewConfig = allModeActiveSource ? DATA_SOURCES[allModeActiveSource.src] : sourceConfig;
              return (
                <div className="dashboard-analysis-section">
                  {allModeActiveSource && (
                    <div className="all-mode-view-badge">
                      <Database size={13} />
                      <span>{viewConfig.label}</span>
                      <span className="badge-separator">—</span>
                      <span>{allModeActiveSource.label.partName}</span>
                      <button className="badge-close" onClick={() => { setAllModeActiveSource(null); setActivePopup(null); }} title="Close">
                        <X size={12} />
                      </button>
                    </div>
                  )}
                  <div className="dashboard-grid">
                    <CustomBarChart title={viewConfig.chartTitles.mfgMonth} data={dashboardData.mfgMonth} color="#f6ad55" icon={History} />
                    <CustomBarChart title={viewConfig.chartTitles.reportingMonth} data={dashboardData.reportingMonth} color="#68d391" icon={FileSpreadsheet} />
                    <CustomBarChart title={viewConfig.chartTitles.kms} data={dashboardData.kms} color="#76e4f7" icon={Activity} />
                    {viewConfig.useMapForRegion ? (
                      <div className="dashboard-chart-card">
                        <div className="chart-header"><MapIcon size={16} /><span>{viewConfig.chartTitles.region}</span></div>
                        <div className="chart-container-inner india-map-container"><IndiaMap data={dashboardData.region} /></div>
                      </div>
                    ) : (
                      <LocationBarChart title={viewConfig.chartTitles.region} data={dashboardData.region} />
                    )}
                  </div>
                </div>
              );
            })()}
            {selectedImage && !activePopup && dataSource !== 'all' && (
              <div className="dashboard-analysis-section dashboard-placeholder">
                <div className="dashboard-placeholder-hint">
                  <BarChart2 size={32} />
                  <p>Click a component marker on the image to view its analytics</p>
                </div>
              </div>
            )}
            {selectedImage && dataSource === 'all' && !allModeActiveSource && (
              <div className="dashboard-analysis-section dashboard-placeholder">
                <div className="dashboard-placeholder-hint">
                  <BarChart2 size={32} />
                  <p>Click a count cell in the table to view source-specific analytics</p>
                </div>
              </div>
            )}
          </div>
        </main>

        {/* ── Agent Panel (right-side drawer) ────────────────────────── */}
        <AnimatePresence>
          {showAgentPanel && (
            <motion.aside
              className="agent-panel"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 360, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: 'easeInOut' }}
            >
              {/* ── Header ──────────────────────────────────────────────── */}
              <div className="agent-panel-header">
                <div className="agent-panel-title">
                  <Bot size={16} />
                  <span>Dashboard Agent</span>
                </div>
                <div className="agent-panel-actions">
                  {/* History toggle */}
                  <button
                    className={`ap-icon-btn ${agentView === 'history' ? 'active' : ''}`}
                    title="Chat history"
                    onClick={() => {
                      if (agentView === 'history') {
                        setAgentView('chat');
                      } else {
                        setAgentView('history');
                        loadAgentHistory();
                      }
                    }}
                  >
                    <History size={15} />
                  </button>
                  {/* New chat */}
                  <button className="ap-icon-btn" title="New chat" onClick={() => { resetAgentChat(); setAgentView('chat'); }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 5v14M5 12h14"/>
                    </svg>
                  </button>
                  {/* Close */}
                  <button className="ap-icon-btn" title="Close" onClick={closeAgentPanel}>
                    <X size={15} />
                  </button>
                </div>
              </div>

              {/* ── History view ────────────────────────────────────────── */}
              {agentView === 'history' && (
                <div className="agent-history-view">
                  <div className="agent-history-label">Recent conversations</div>
                  {agentHistoryLoading ? (
                    <div className="agent-history-loading">
                      <div className="agent-typing-dots"><span /><span /><span /></div>
                    </div>
                  ) : agentHistory.length === 0 ? (
                    <div className="agent-history-empty">No conversations yet</div>
                  ) : (
                    <div className="agent-history-list">
                      {agentHistory.map(h => (
                        <button
                          key={h.id}
                          className={`agent-history-item ${h.id === agentConvId ? 'active' : ''}`}
                          onClick={() => selectAgentConversation(h.id)}
                        >
                          <div className="ahi-icon"><Bot size={13} /></div>
                          <div className="ahi-body">
                            <span className="ahi-title">{h.title}</span>
                            {h.date && (
                              <span className="ahi-date">
                                {h.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                              </span>
                            )}
                          </div>
                          {h.id === agentConvId && <div className="ahi-dot" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── Chat view ───────────────────────────────────────────── */}
              {agentView === 'chat' && (
                <>
                  <div className="agent-panel-body" ref={agentPanelBodyRef}>
                    {agentMessages.map(msg => (
                      <AgentMessage key={msg.id} msg={msg} />
                    ))}

                    {/* Thinking steps — bot avatar + collapsible panel */}
                    {agentLoading && agentThinkingSteps.length > 0 && (
                      <div className="agent-msg bot">
                        <div className="agent-msg-avatar"><Bot size={13} /></div>
                        <div className="agent-thinking-wrap">
                          <button
                            className="agent-thinking-toggle"
                            onClick={() => setAgentThinkingOpen(o => !o)}
                          >
                            <span className="thinking-pulse" />
                            <span>Thinking…</span>
                            <ChevronDown size={13} className={agentThinkingOpen ? 'rotate' : ''} />
                          </button>
                          {agentThinkingOpen && (
                            <div className="agent-thinking-steps">
                              {agentThinkingSteps.map((s, i) => (
                                <div key={i} className="agent-thinking-step">
                                  <span className="thinking-label">{s.step}</span>
                                  <p className="thinking-content">{s.content}</p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Streaming response */}
                    {agentLoading && agentStreamingText && (
                      <div className="agent-msg bot">
                        <div className="agent-msg-avatar"><Bot size={13} /></div>
                        <div className="agent-msg-bubble streaming">
                          <div className="agent-msg-markdown">
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                              components={{ table: ({ node, ...props }) => <div className="agent-table-wrap"><table {...props} /></div> }}
                            >
                              {fixMarkdownTables(agentStreamingText, false)}
                            </ReactMarkdown>
                          </div>
                          <span className="stream-cursor" />
                        </div>
                      </div>
                    )}

                    {/* Typing dots while waiting */}
                    {agentLoading && !agentStreamingText && agentThinkingSteps.length === 0 && (
                      <div className="agent-msg bot">
                        <div className="agent-msg-avatar"><Bot size={13} /></div>
                        <div className="agent-msg-bubble">
                          <div className="agent-typing-dots"><span /><span /><span /></div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Progress status bar — shows stage between thinking and final response */}
                  {agentLoading && agentProgress && (
                    <div className={`agent-progress-bar agent-progress-${agentProgress.stage}`}>
                      <span className="ap-progress-dot" />
                      <span className="ap-progress-label">
                        {agentProgress.stage === 'thinking' && `Thinking${agentProgress.stepCount ? ` (${agentProgress.stepCount} steps)` : '…'}`}
                        {agentProgress.stage === 'generating' && `Generating response${agentProgress.stepCount ? ` · ${agentProgress.stepCount} steps` : '…'}`}
                        {agentProgress.stage === 'retrying' && agentProgress.detail}
                      </span>
                    </div>
                  )}

                  {/* Input footer */}
                  <div className="agent-panel-footer">
                    <textarea
                      className="agent-input"
                      placeholder="Ask about warranty, RPT, GNOVAC…"
                      value={agentInput}
                      onChange={e => setAgentInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAgentSend(); }
                      }}
                      rows={2}
                      disabled={agentLoading}
                    />
                    <button
                      className="agent-send-btn"
                      onClick={handleAgentSend}
                      disabled={agentLoading || !agentInput.trim()}
                      title="Send (Enter)"
                    >
                      <Send size={15} />
                    </button>
                  </div>
                </>
              )}
            </motion.aside>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}

function DraggableNode({ label, initialPos, count }) {
  const [pos, setPos] = useState(initialPos);
  useEffect(() => { setPos(initialPos); }, [initialPos]);

  return (
    <>
      <svg className="connecting-line" viewBox="0 0 100 100" preserveAspectRatio="none">
        <path d={`M ${label.x} ${label.y} L ${pos.x} ${pos.y}`} stroke="#e53e3e" strokeWidth="0.5" fill="none" />
      </svg>
      <motion.div drag dragMomentum={false} onDrag={(e, info) => {
          const container = document.querySelector('.cad-img-container');
          if (container) {
            const rect = container.getBoundingClientRect();
            const newX = ((info.point.x - rect.left) / rect.width) * 100;
            const newY = ((info.point.y - rect.top) / rect.height) * 100;
            setPos({ x: newX, y: newY });
          }
        }} className="summary-node" style={{ left: `${pos.x}%`, top: `${pos.y}%` }}>
        <div className="node-title">{label.partName}</div>
        <div className="node-count">{count} Failures</div>
      </motion.div>
    </>
  );
}

export default PartLabeler;
