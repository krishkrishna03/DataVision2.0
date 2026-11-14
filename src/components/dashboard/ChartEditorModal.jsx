import { useState } from 'react';
import { X } from 'lucide-react';
import { aggregateRows, aggregateValues, defaultAggregation, parseMetricValue } from '../../analysis/semanticMetrics';

const COLOR_PRESETS = [
  { name: 'Indigo', bg: 'rgba(99,102,241,0.1)', accent: 'rgba(99,102,241,0.8)' },
  { name: 'Blue', bg: 'rgba(59,130,246,0.1)', accent: 'rgba(59,130,246,0.8)' },
  { name: 'Green', bg: 'rgba(34,197,94,0.1)', accent: 'rgba(34,197,94,0.8)' },
  { name: 'Orange', bg: 'rgba(249,115,22,0.1)', accent: 'rgba(249,115,22,0.8)' },
  { name: 'Pink', bg: 'rgba(236,72,153,0.1)', accent: 'rgba(236,72,153,0.8)' },
  { name: 'Cyan', bg: 'rgba(34,211,238,0.1)', accent: 'rgba(34,211,238,0.8)' },
];

const inputStyle = { width: '100%', padding: '8px 10px', background: 'var(--bg-base)', border: '1px solid var(--border-default)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 13, outline: 'none' };
const labelStyle = { display: 'block', fontSize: 12, marginBottom: 6, fontWeight: 600, color: 'var(--text-secondary)' };
const AGGREGATIONS = [
  ['sum', 'Sum'], ['average', 'Average'], ['count', 'Count'],
  ['distinct_count', 'Distinct count'], ['min', 'Minimum'], ['max', 'Maximum'], ['median', 'Median'],
];

export default function ChartEditorModal({ isOpen, onClose, chart, dataset, analysis, onSave }) {
  const [formData, setFormData] = useState(() => initialForm(chart));
  if (!isOpen || !chart) return null;

  const columns = dataset?.columns || [];
  const profiles = analysis?.columnProfiles || [];
  const profileByColumn = new Map(profiles.map(profile => [profile.column, profile]));
  const numericColumns = profiles.filter(profile => profile.isPotentialMeasure).map(profile => profile.column);
  const metricColumns = profiles.filter(profile => profile.isPotentialMeasure || profile.role === 'ID').map(profile => profile.column);
  const metricProfile = profileByColumn.get(formData.yKey);
  const allowedAggregations = metricProfile?.role === 'ID'
    ? ['distinct_count', 'count']
    : metricProfile?.role === 'PERCENTAGE'
      ? ['average', 'median', 'min', 'max', 'count']
      : AGGREGATIONS.map(([key]) => key);

  const handleChange = event => {
    const { name, value } = event.target;
    setFormData(current => {
      if (name === 'yKey') {
        const nextProfile = profileByColumn.get(value);
        const aggregation = defaultAggregation(nextProfile);
        return { ...current, yKey: value, aggregation, format: nextProfile?.role === 'PERCENTAGE' ? 'percent' : 'raw' };
      }
      if (name === 'xKey' && current.recommendationMode === 'recommended') {
        return { ...current, xKey: value, type: recommendChartType(profileByColumn.get(value)) };
      }
      if (name === 'recommendationMode' && value === 'recommended') {
        return { ...current, recommendationMode: value, type: recommendChartType(profileByColumn.get(current.xKey)) };
      }
      return { ...current, [name]: value };
    });
  };

  const handleSave = () => {
    const rows = dataset?.sample || [];
    if (!formData.title.trim()) return;
    if (formData.type === 'kpi') {
      const selectedProfile = profileByColumn.get(formData.yKey);
      if (!formData.yKey || (selectedProfile?.role === 'ID' && !['distinct_count', 'count'].includes(formData.aggregation))) return;
      const value = aggregateValues(rows.map(row => row[formData.yKey]).filter(item => item != null && item !== ''), formData.aggregation);
      const values = rows.map(row => parseMetricValue(row[formData.yKey])).filter(value => value != null);
      onSave(chart.id, {
        ...formData,
        title: formData.title.trim(),
        type: 'kpi',
        column: formData.yKey,
        value,
        avg: aggregateValues(rows.map(row => row[formData.yKey]), 'average'),
        max: aggregateValues(rows.map(row => row[formData.yKey]), 'max'),
        min: aggregateValues(rows.map(row => row[formData.yKey]), 'min'),
        count: values.length,
        definition: `${formData.aggregation} of ${formData.yKey}; identifiers cannot be summed and rates are averaged.`,
        formula: `${formData.aggregation.toUpperCase()}(${formData.yKey})`,
        role: selectedProfile?.role,
      });
    } else {
      const dimension = formData.xKey;
      const measure = formData.yKey === '__count__' ? null : formData.yKey;
      if (!dimension && formData.type !== 'table') return;
      if (!measure && formData.yKey !== '__count__' && formData.type !== 'table') return;
      let data;
      if (formData.type === 'table') data = rows.slice(0, 100);
      else if (formData.type === 'scatter') data = rows.slice(0, 500);
      else {
        data = aggregateRows(rows, dimension, measure, formData.aggregation, Number(formData.topN) || 15);
        if (formData.sortOrder === 'ascending') data.reverse();
      }
      onSave(chart.id, {
        ...formData,
        title: formData.title.trim(),
        nameKey: dimension,
        valueKey: formData.yKey === '__count__' ? 'count' : formData.yKey,
        data,
        explanation: {
          ...chart.explanation,
          what: `${formData.aggregation} ${formData.yKey === '__count__' ? 'records' : formData.yKey} by ${dimension}`,
          why: `The chart uses ${formData.aggregation} aggregation and displays ${formData.topN} sorted categories.`,
        },
      });
    }
    onClose();
  };

  return (
    <>
      <button className="editor-scrim" onClick={onClose} aria-label="Close chart editor" />
      <div className="editor-panel" role="dialog" aria-modal="true" aria-labelledby="chart-editor-title">
        <div className="editor-heading"><h3 id="chart-editor-title">Edit {formData.type === 'kpi' ? 'KPI card' : 'chart'}</h3><button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close"><X size={17} /></button></div>
        <div className="editor-fields">
          <label style={labelStyle}>Title<input name="title" value={formData.title} onChange={handleChange} style={inputStyle} placeholder="Enter a clear title" /></label>
          {formData.type !== 'kpi' && <label style={labelStyle}>Chart mode<select name="recommendationMode" value={formData.recommendationMode} onChange={handleChange} style={inputStyle}><option value="recommended">AI Recommended</option><option value="alternatives">Explore Alternatives</option><option value="custom">Custom Chart</option></select></label>}
          <label style={labelStyle}>Visualization<select name="type" value={formData.type} onChange={handleChange} style={inputStyle}>
            <option value="kpi">KPI card</option><option value="bar">Bar chart</option><option value="line">Line chart</option><option value="area">Area chart</option><option value="pie">Pie chart</option><option value="donut">Donut chart</option><option value="scatter">Scatter chart</option><option value="table">Data table</option>
          </select></label>
          {formData.type === 'kpi' ? <>
            <label style={labelStyle}>Metric field<select name="yKey" value={formData.yKey} onChange={handleChange} style={inputStyle}><option value="">Choose a field</option>{metricColumns.map(name => <option key={name} value={name}>{name}</option>)}</select></label>
            <label style={labelStyle}>Aggregation<select name="aggregation" value={formData.aggregation} onChange={handleChange} style={inputStyle}>{allowedAggregations.map(key => <option key={key} value={key}>{AGGREGATIONS.find(([item]) => item === key)?.[1] || key}</option>)}</select></label>
            {metricProfile?.role === 'PERCENTAGE' && <p className="analysis-caveat">Rates are averaged by default and cannot be summed. Weighted averages require a denominator field.</p>}
            {metricProfile?.role === 'ID' && <p className="analysis-caveat">Identifiers support count or distinct count only.</p>}
          </> : formData.type !== 'table' ? <>
            <label style={labelStyle}>Dimension<select name="xKey" value={formData.xKey} onChange={handleChange} style={inputStyle}><option value="">Choose a dimension</option>{columns.map(name => <option key={name} value={name}>{name}{profileByColumn.get(name)?.role === 'ID' ? ' (ID; Top N)' : ''}</option>)}</select></label>
            <label style={labelStyle}>Measure<select name="yKey" value={formData.yKey} onChange={handleChange} style={inputStyle}><option value="__count__">Record count</option>{numericColumns.map(name => <option key={name} value={name}>{name}</option>)}</select></label>
            {formData.type !== 'scatter' && <>
              <label style={labelStyle}>Aggregation<select name="aggregation" value={formData.aggregation} onChange={handleChange} style={inputStyle}>{(metricProfile?.role === 'PERCENTAGE' ? ['average', 'median', 'min', 'max', 'count'] : AGGREGATIONS.map(([key]) => key)).map(key => <option key={key} value={key}>{AGGREGATIONS.find(([item]) => item === key)?.[1] || key}</option>)}</select></label>
              <label style={labelStyle}>Category limit<input name="topN" type="number" min="2" max="100" value={formData.topN} onChange={handleChange} style={inputStyle} /></label>
              <label style={labelStyle}>Sort<select name="sortOrder" value={formData.sortOrder} onChange={handleChange} style={inputStyle}><option value="descending">Highest first</option><option value="ascending">Lowest first</option></select></label>
            </>}
            {formData.type === 'pie' || formData.type === 'donut' ? <p className="analysis-caveat">Use a small number of categories; the category limit keeps the chart readable.</p> : null}
            {formData.recommendationMode === 'recommended' && formData.xKey && <p className="analysis-caveat">{profileByColumn.get(formData.xKey)?.isHighCardinality ? 'High-cardinality field: only the configured Top N categories are displayed.' : profileByColumn.get(formData.xKey)?.isPotentialDate ? 'A time field is selected; a line chart is recommended for trends.' : 'A bar chart is recommended for comparing categories.'}</p>}
          </> : <p className="analysis-caveat">The table displays the first 100 rows in the current dataset sample.</p>}
          <div><span style={labelStyle}>Card color</span><div className="editor-swatches">{COLOR_PRESETS.map(preset => <button key={preset.name} onClick={() => setFormData(current => ({ ...current, bgColor: preset.bg, accentColor: preset.accent }))} title={preset.name} style={{ background: preset.accent }} />)}</div></div>
          <div className="editor-actions"><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={handleSave}>Save changes</button></div>
        </div>
      </div>
    </>
  );
}

function initialForm(chart) {
  return {
    title: chart?.title || '',
    type: chart?.type || 'bar',
    recommendationMode: chart?.recommendationMode || 'recommended',
    xKey: chart?.xKey || chart?.nameKey || '',
    yKey: chart?.yKey || chart?.valueKey || chart?.column || '',
    aggregation: chart?.aggregation || 'sum',
    topN: chart?.topN || 15,
    sortOrder: chart?.sortOrder || 'descending',
    bgColor: chart?.bgColor || 'rgba(99,102,241,0.1)',
    accentColor: chart?.accentColor || 'rgba(99,102,241,0.8)',
    format: chart?.format || 'raw',
  };
}

function recommendChartType(profile) {
  return profile?.isPotentialDate ? 'line' : 'bar';
}
