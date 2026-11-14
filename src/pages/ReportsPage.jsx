import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Download, FileSpreadsheet, FileText, LockKeyhole, Printer, Share2, ShieldCheck } from 'lucide-react';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';
import { runAnalysis } from '../analysis/engine';
import { useDataStore, useDashboardStore } from '../store/store';
import { applyFilters } from '../utils/chartDataProcessor';
import { generateAnalysisReport } from '../report/reportGenerator';

const EXPORT_ROW_LIMIT = 10000;

export default function ReportsPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const datasets = useDataStore(state => state.datasets);
  const activeDatasetId = useDataStore(state => state.activeDatasetId);
  const dashboards = useDashboardStore(state => state.dashboards);
  const activeDashboardId = useDashboardStore(state => state.activeDashboardId);
  const activeDashboard = dashboards.find(item => item.id === activeDashboardId);
  const requestedDashboardId = searchParams.get('dashboard');
  const requestedDatasetId = searchParams.get('dataset');
  const datasetId = requestedDatasetId || activeDashboard?.datasetId || activeDatasetId || datasets[0]?.id || '';
  const dataset = datasets.find(item => item.id === datasetId);
  const availableDashboards = dashboards.filter(item => item.datasetId === dataset?.id);
  const dashboard = requestedDashboardId
    ? availableDashboards.find(item => item.id === requestedDashboardId)
    : !requestedDatasetId && activeDashboard?.datasetId === dataset?.id ? activeDashboard : null;
  const setActiveDashboard = useDashboardStore(state => state.setActiveDashboard);
  const filters = useMemo(() => dashboard?.filters || {}, [dashboard?.filters]);
  const timeline = dashboard?.timeline || null;
  const filteredRows = useMemo(() => dataset ? applyFilters(dataset.sample || [], filters, timeline) : [], [dataset, filters, timeline]);
  const analysis = useMemo(() => dataset ? runAnalysis(filteredRows, dataset.columns || [], {
    datasetName: dataset.name,
    fileType: dataset.fileType,
    fileSize: dataset.sizeBytes,
    roleOverrides: dataset.roleOverrides || {},
  }) : null, [dataset, filteredRows]);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const changeContext = (nextDatasetId, nextDashboardId = '') => {
    const params = new URLSearchParams({ dataset: nextDatasetId });
    if (nextDashboardId) params.set('dashboard', nextDashboardId);
    navigate(`/reports?${params.toString()}`);
    if (nextDashboardId) setActiveDashboard(nextDashboardId);
  };

  const downloadCsv = () => {
    if (!dataset) return;
    const rows = filteredRows.slice(0, EXPORT_ROW_LIMIT);
    const escape = value => {
      const text = String(value ?? '');
      const safe = /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
      return `"${safe.replaceAll('"', '""')}"`;
    };
    const csv = [
      dataset.columns.map(escape).join(','),
      ...rows.map(row => dataset.columns.map(column => escape(row[column])).join(',')),
    ].join('\r\n');
    downloadBlob(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }), `${safeName(dataset.name)}_filtered.csv`);
    setStatus(exportStatus(filteredRows, rows, dataset));
  };

  const downloadXlsx = () => {
    if (!dataset) return;
    const rows = filteredRows.slice(0, EXPORT_ROW_LIMIT);
    const sheet = XLSX.utils.json_to_sheet(rows.map(row => Object.fromEntries(dataset.columns.map(column => [column, safeSpreadsheetValue(row[column])]))), { header: dataset.columns });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'Filtered data');
    XLSX.writeFile(workbook, `${safeName(dataset.name)}_filtered.xlsx`);
    setStatus(exportStatus(filteredRows, rows, dataset));
  };

  const generatePdf = async () => {
    if (!dataset || !dashboard) return;
    setBusy(true);
    try {
      await generateAnalysisReport(dataset, analysis || dashboard.charts, { filters, timeline });
      setStatus('PDF report generated using the current filter context.');
    } catch (error) {
      console.error('PDF report failed:', error);
      setStatus(`PDF report could not be generated: ${error.message}`);
    } finally {
      setBusy(false);
    }
  };

  const exportPng = async () => {
    const element = document.getElementById('report-preview');
    if (!element) return;
    setBusy(true);
    try {
      const canvas = await html2canvas(element, { backgroundColor: '#0a0d14', scale: 2 });
      const link = document.createElement('a');
      link.download = `${safeName(dataset?.name || 'DataVision')}_summary.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      setStatus('Summary image downloaded.');
    } catch (error) {
      console.error('PNG export failed:', error);
      setStatus(`Image export could not be generated: ${error.message}`);
    } finally {
      setBusy(false);
    }
  };

  if (!dataset) {
    return <div className="page-wrap"><div className="empty-panel"><FileText size={30} /><h2>No report data yet</h2><p>Import a dataset to create filtered exports and reports.</p><button className="btn btn-primary" onClick={() => navigate('/upload')}>Upload data</button></div></div>;
  }

  return (
    <div className="page-wrap animate-fade-in">
      <section className="page-heading">
        <div><div className="eyebrow"><FileText size={14} /> Reports & exports</div><h2>Share insights, safely</h2><p>Choose the dataset and dashboard context for exports and report previews. Without a dashboard, exports include all locally available rows.</p></div>
        <div className="context-selectors">
          <label>Dataset
            <select className="input dataset-select" aria-label="Report dataset" value={dataset.id} onChange={event => changeContext(event.target.value)}>
              {datasets.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label>Dashboard filters
            <select className="input dataset-select" aria-label="Report dashboard" value={dashboard?.id || ''} onChange={event => changeContext(dataset.id, event.target.value)}>
              <option value="">All rows (no dashboard filters)</option>
              {availableDashboards.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
            </select>
          </label>
        </div>
      </section>

      <section className="report-actions">
        <article className="panel-section report-action-card"><div className="report-icon"><FileSpreadsheet size={20} /></div><h3>Dataset export</h3><p>{dashboard ? `CSV/XLSX exports use the saved filters from “${dashboard.title}” and a safe row limit. Spreadsheet formula-like values are escaped.` : 'CSV/XLSX exports include all locally available rows and use a safe row limit. Spreadsheet formula-like values are escaped.'}</p><div className="report-button-row"><button className="btn btn-secondary" onClick={downloadCsv}><Download size={15} /> Export CSV</button><button className="btn btn-primary" onClick={downloadXlsx}><Download size={15} /> Export XLSX</button></div></article>
        <article className="panel-section report-action-card"><div className="report-icon cyan"><FileText size={20} /></div><h3>PDF report</h3><p>Generate an executive summary with computed metrics, data quality and analysis notes for the selected dashboard.</p><button className="btn btn-primary" disabled={!dashboard || busy} onClick={generatePdf}><FileText size={15} /> {busy ? 'Generating…' : 'Generate PDF'}</button>{!dashboard && <small>Select a dashboard above to enable PDF reports.</small>}</article>
        <article className="panel-section report-action-card"><div className="report-icon green"><Share2 size={20} /></div><h3>Read-only sharing</h3><p>Public links are intentionally unavailable because this app has no account, permission, expiry or revocation service.</p><button className="btn btn-secondary" disabled title="Requires server-side authentication and access controls"><LockKeyhole size={15} /> Secure links unavailable</button><small>No raw dataset is exposed through a share link.</small></article>
      </section>

      <section className="report-preview" id="report-preview">
        <div className="section-title"><div><h3>{dataset.name}{dashboard ? ` — ${dashboard.title}` : ''} — report preview</h3><p>Generated {new Date().toLocaleString()} · {filteredRows.length.toLocaleString()} rows in current context{dashboard ? ` · filters from ${dashboard.title}` : ' · no dashboard filters'}</p></div><div className="report-button-row"><button className="btn btn-ghost btn-sm" onClick={() => window.print()}><Printer size={14} /> Print</button><button className="btn btn-secondary btn-sm" onClick={exportPng} disabled={busy}><Download size={14} /> PNG</button></div></div>
        <div className="metric-strip">
          {(analysis?.kpis || []).slice(0, 4).map(kpi => <div className="metric-card" key={kpi.id}><span>{kpi.title}</span><strong>{Number(kpi.value).toLocaleString(undefined, { maximumFractionDigits: 2 })}{kpi.format === 'percent' ? '%' : ''}</strong><small>{kpi.definition || kpi.reason}</small></div>)}
        </div>
        <div className="report-summary">
          <div><ShieldCheck size={17} /><strong>Data quality: {analysis?.dataQuality?.qualityScore ?? 0}/100</strong><span>{analysis?.dataQuality?.totalMissing?.toLocaleString() || 0} missing cells · {analysis?.dataQuality?.duplicateRows?.toLocaleString() || 0} duplicate sample rows</span></div>
          <div><span className="badge badge-cyan">{dataset.columns.length} fields</span><span className="badge badge-primary">{dataset.fileType?.toUpperCase()}</span>{(dataset.isSampled || dataset.sample?.length < dataset.rowCount) && <span className="badge badge-amber">Sample only</span>}</div>
        </div>
        <div className="report-insights">{(analysis?.insights || []).slice(0, 4).map((insight, index) => <div key={`${insight.title}-${index}`}><strong>{insight.title}</strong><span>{insight.body}</span></div>)}</div>
      </section>

      {status && <div className="notice-banner" role="status">{status}</div>}
      {filteredRows.length > EXPORT_ROW_LIMIT && <div className="notice-banner"><ShieldCheck size={16} /> Export is capped at {EXPORT_ROW_LIMIT.toLocaleString()} rows. The source dataset has not been changed.</div>}
    </div>
  );
}

function safeSpreadsheetValue(value) {
  if (typeof value !== 'string') return value;
  return /^[\s]*[=+\-@]/.test(value) ? `'${value}` : value;
}

function safeName(value) {
  return Array.from(String(value), character => /[<>:"/\\|?*]/.test(character) || character.charCodeAt(0) < 32 ? '_' : character).join('').slice(0, 100) || 'DataVision';
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function exportStatus(filteredRows, rows, dataset) {
  const sampleNotice = dataset.isSampled || dataset.sample?.length < dataset.rowCount ? ` Only ${dataset.sample.length.toLocaleString()} sampled rows are stored locally.` : '';
  const limitNotice = filteredRows.length > rows.length ? ` Export limited to ${EXPORT_ROW_LIMIT.toLocaleString()} rows.` : '';
  return `Exported ${rows.length.toLocaleString()} of ${filteredRows.length.toLocaleString()} available rows.${limitNotice}${sampleNotice}`;
}
