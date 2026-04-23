import React, { useRef, useState, useEffect } from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

/**
 * ChartComponent - Renders different types of charts based on chart data
 *
 * @param {Object} chartData - Chart configuration and data
 * @param {string} chartData.type - Chart type: 'bar', 'line', or 'pie'
 * @param {string} chartData.title - Chart title
 * @param {Array} chartData.data - Chart data points
 * @param {Object} chartData.config - Chart configuration (axes, colors, etc.)
 */
const ChartComponent = ({ chartData }) => {
  // Measure the wrapper's actual pixel width via ResizeObserver so charts
  // render correctly even when mounted inside animating or flex containers
  // (e.g. the Framer Motion panel that starts at width:0).
  const wrapperRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    // Measure immediately in case the container already has a layout
    if (el.offsetWidth > 0) setContainerWidth(el.offsetWidth);
    const ro = new ResizeObserver(() => {
      if (el.offsetWidth > 0) setContainerWidth(el.offsetWidth);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!chartData || !chartData.data || chartData.data.length === 0) {
    return null;
  }

  const { type, title, data, config = {} } = chartData;

  // Theme-matched colors: all visible on white, crimson red primary
  const DEFAULT_COLORS = [
    '#CC0000', // Mahindra crimson red
    '#E8A838', // amber gold (distinct, warm complement)
    '#8B0000', // dark crimson
    '#FF6B6B', // coral red
    '#B5770D', // dark amber
    '#C0392B', // pomegranate
    '#F4845F', // salmon
    '#7B1B1B', // very dark red
  ];

  const colors = config.colors || DEFAULT_COLORS;

  // Format month numbers to short month names
  const formatMonth = (value) => {
    // Handle both "1" and "01" formats
    const monthMap = {
      '1': 'Jan', '01': 'Jan',
      '2': 'Feb', '02': 'Feb',
      '3': 'Mar', '03': 'Mar',
      '4': 'Apr', '04': 'Apr',
      '5': 'May', '05': 'May',
      '6': 'Jun', '06': 'Jun',
      '7': 'Jul', '07': 'Jul',
      '8': 'Aug', '08': 'Aug',
      '9': 'Sep', '09': 'Sep',
      '10': 'Oct', '11': 'Nov', '12': 'Dec'
    };
    // Also handle numeric values
    const strValue = String(value);
    return monthMap[strValue] || value;
  };

  // Custom tooltip formatter for better readability
  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload) return null;

    return (
      <div style={{
        backgroundColor: '#ffffff',
        border: '1px solid #CC0000',
        borderRadius: '6px',
        padding: '8px 10px',
        color: '#111827',
        boxShadow: '0 2px 8px rgba(0,0,0,0.12)'
      }}>
        <p style={{fontWeight: 'bold', color: '#CC0000', fontSize: '11px' }}>
          {formatMonth(label)}
        </p>
        {payload.map((entry, index) => (
          <p key={index} style={{ color: '#374151' }}>
            <span style={{ color: entry.color }}>●</span> {entry.name}: {entry.value}
          </p>
        ))}
      </div>
    );
  };

  // Helper: returns true if a value is numeric or a string that parses as a finite number
  const isNumericValue = (v) => {
    if (typeof v === 'number') return true;
    if (typeof v === 'string' && v.trim() !== '') {
      const n = parseFloat(v.replace(/[^0-9.-]/g, ''));
      return !isNaN(n) && isFinite(n);
    }
    return false;
  };

  // Render Bar Chart
  const renderBarChart = () => {
    // Detect xAxis key — fall back to first string column if specified key isn't in data
    const specifiedX = config.xAxis || 'name';
    const xAxis = (specifiedX in data[0])
      ? specifiedX
      : Object.keys(data[0]).find(k => typeof data[0][k] === 'string') || Object.keys(data[0])[0];

    // Detect yAxis keys — fall back to all numeric columns if none specified or none match.
    // Also handles PostgreSQL Decimal values serialised as strings (e.g. "123.45").
    const specifiedY = Array.isArray(config.yAxis) && config.yAxis.length > 0
      ? config.yAxis.filter(k => k in data[0])
      : [];
    const yAxes = specifiedY.length > 0
      ? specifiedY
      : Object.keys(data[0]).filter(k => k !== xAxis && isNumericValue(data[0][k]));

    // Coerce y values to numbers in case SQL returned string numerics
    const coercedData = data.map(row => {
      const r = { ...row };
      yAxes.forEach(k => { r[k] = parseFloat(String(r[k]).replace(/[^0-9.-]/g, '')) || 0; });
      return r;
    });

    const xAxisLabel = config.xAxisLabel || xAxis;
    const yAxisLabel = config.yAxisLabel || (yAxes.length === 1 ? yAxes[0] : 'Value');

    if (yAxes.length === 0) return <div style={{color:'#9ca3af',padding:'16px',textAlign:'center'}}>No numeric columns to chart.</div>;

    return (
      <div style={{ width: '100%', height: 300 }}>
        <ResponsiveContainer width={containerWidth} height={300}>
          <BarChart
            data={coercedData}
            margin={{ top: 5, right: 10, left: 10, bottom: 40 }}
            onClick={null}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey={xAxis}
              stroke="#d1d5db"
              tick={{ fill: '#6b7280', fontSize: 10 }}
              angle={-35}
              textAnchor="end"
              interval={0}
              height={60}
            />
            <YAxis
              stroke="#d1d5db"
              tick={{ fill: '#6b7280', fontSize: 10 }}
              width={45}
              tickFormatter={v => (v >= 1000 ? `${(v/1000).toFixed(1)}k` : v)}
            />
            <Tooltip content={<CustomTooltip />} />
            {yAxes.map((key, index) => (
              <Bar
                key={key}
                dataKey={key}
                name={key.replace(/_/g, ' ')}
                fill={colors[index % colors.length]}
                radius={[3, 3, 0, 0]}
                onClick={null}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  };

  // Render Line Chart
  const renderLineChart = () => {
    // Same resilient key detection as bar chart
    const specifiedX = config.xAxis || 'name';
    const xAxis = (specifiedX in data[0])
      ? specifiedX
      : Object.keys(data[0]).find(k => typeof data[0][k] === 'string') || Object.keys(data[0])[0];
    const specifiedY = Array.isArray(config.yAxis) && config.yAxis.length > 0
      ? config.yAxis.filter(k => k in data[0])
      : [];
    const yAxes = specifiedY.length > 0
      ? specifiedY
      : Object.keys(data[0]).filter(k => k !== xAxis && isNumericValue(data[0][k]));
    const coercedData = data.map(row => {
      const r = { ...row };
      yAxes.forEach(k => { r[k] = parseFloat(String(r[k]).replace(/[^0-9.-]/g, '')) || 0; });
      return r;
    });
    const xAxisLabel = config.xAxisLabel || xAxis;
    const yAxisLabel = config.yAxisLabel || (yAxes.length === 1 ? yAxes[0] : 'Value');

    if (yAxes.length === 0) return <div style={{color:'#9ca3af',padding:'16px',textAlign:'center'}}>No numeric columns to chart.</div>;

    return (
      <div style={{ width: '100%', height: 300 }}>
        <ResponsiveContainer width={containerWidth} height={300}>
          <LineChart
            data={coercedData}
            margin={{ top: 5, right: 10, left: 10, bottom: 40 }}
            onClick={null}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey={xAxis}
              stroke="#d1d5db"
              tick={{ fill: '#6b7280', fontSize: 10 }}
              tickFormatter={formatMonth}
              angle={-35}
              textAnchor="end"
              interval={0}
              height={60}
            />
            <YAxis
              stroke="#d1d5db"
              tick={{ fill: '#6b7280', fontSize: 10 }}
              width={45}
              tickFormatter={v => (v >= 1000 ? `${(v/1000).toFixed(1)}k` : v)}
            />
            <Tooltip content={<CustomTooltip />} />
            {yAxes.map((key, index) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                name={key.replace(/_/g, ' ')}
                stroke={colors[index % colors.length]}
                strokeWidth={2}
                dot={{ fill: colors[index % colors.length], r: 4 }}
                activeDot={{ r: 6 }}
                onClick={null}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  };

  // Render Pie Chart
  const renderPieChart = () => {
    // Resilient key detection
    const specifiedName = config.nameKey || config.xAxis || 'name';
    const nameKey = (specifiedName in data[0])
      ? specifiedName
      : Object.keys(data[0]).find(k => typeof data[0][k] === 'string') || Object.keys(data[0])[0];

    const specifiedValue = config.valueKey || (config.yAxis && config.yAxis[0]) || 'value';
    const valueKey = (specifiedValue in data[0])
      ? specifiedValue
      : Object.keys(data[0]).find(k => k !== nameKey && typeof data[0][k] === 'number') || Object.keys(data[0])[1];

    // Ensure data has the correct format for pie chart
    const pieData = data.map(item => ({
      name: item[nameKey],
      value: parseFloat(String(item[valueKey] || '0').replace(/[^0-9.-]/g, '')) || 0
    }));

    // Inline % label rendered inside the slice (never overflows SVG bounds)
    const renderInlineLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
      if (percent < 0.08) return null; // skip tiny slices
      const RADIAN = Math.PI / 180;
      const r = innerRadius + (outerRadius - innerRadius) * 0.55;
      const x = cx + r * Math.cos(-midAngle * RADIAN);
      const y = cy + r * Math.sin(-midAngle * RADIAN);
      return (
        <text
          x={x}
          y={y}
          fill="#ffffff"
          textAnchor="middle"
          dominantBaseline="central"
          style={{ fontSize: '10px', fontWeight: '700' }}
        >
          {`${(percent * 100).toFixed(1)}%`}
        </text>
      );
    };

    // Custom pie tooltip
    const PieTooltip = ({ active, payload }) => {
      if (!active || !payload || !payload[0]) return null;
      const item = payload[0];
      const total = pieData.reduce((sum, d) => sum + d.value, 0);
      const percent = ((item.value / total) * 100).toFixed(1);
      return (
        <div style={{
          backgroundColor: '#ffffff',
          border: '1px solid #CC0000',
          borderRadius: '6px',
          padding: '8px 10px',
          color: '#111827',
          boxShadow: '0 2px 8px rgba(0,0,0,0.12)'
        }}>
          <p style={{ margin: '0', fontWeight: 'bold', color: '#CC0000', fontSize: '11px' }}>
            {item.name}
          </p>
          <p style={{ margin: '3px 0 0', color: '#374151', fontSize: '11px' }}>
            {item.value} ({percent}%)
          </p>
        </div>
      );
    };

    return (
      <div style={{ width: '100%', height: 340 }}>
        <ResponsiveContainer width={containerWidth} height={340}>
          <PieChart margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
            <Pie
              data={pieData}
              cx="50%"
              cy="44%"
              outerRadius={80}
              dataKey="value"
              label={renderInlineLabel}
              labelLine={false}
              onClick={null}
            >
              {pieData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
              ))}
            </Pie>
            <Tooltip content={<PieTooltip />} />
            <Legend
              iconType="square"
              iconSize={8}
              wrapperStyle={{ fontSize: '10px', color: '#374151', paddingTop: '6px' }}
              formatter={(value) => (
                <span style={{ color: '#374151', fontSize: '10px' }}>
                  {value && value.length > 18 ? value.slice(0, 18) + '…' : value}
                </span>
              )}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  };

  // Render appropriate chart type
  const renderChart = () => {
    switch (type?.toLowerCase()) {
      case 'bar':
        return renderBarChart();
      case 'line':
        return renderLineChart();
      case 'pie':
        return renderPieChart();
      default:
        return <div className="text-red-400">Unsupported chart type: {type}</div>;
    }
  };

  return (
    <div style={{
      display: 'block',
      width: '100%',
      margin: '8px 0',
      padding: '12px',
      backgroundColor: '#ffffff',
      borderRadius: '8px',
      border: '1px solid #e5e7eb',
      boxSizing: 'border-box',
    }}>
      {title && (
        <h3 style={{
          fontSize: '0.8rem',
          fontWeight: '600',
          color: '#CC0000',
          marginBottom: '10px',
          paddingBottom: '8px',
          borderBottom: '1px solid #e5e7eb',
        }}>
          {title}
        </h3>
      )}
      {/* wrapperRef measures the actual pixel width so charts render correctly
          inside animating / flex containers where width:"100%" resolves to 0 */}
      <div ref={wrapperRef} style={{ display: 'block', width: '100%' }}>
        {containerWidth > 0 && renderChart()}
      </div>
    </div>
  );
};

export default ChartComponent;
