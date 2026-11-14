import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Activity, ArrowRight, Bot, CircleAlert as AlertCircle, GitBranch, MessageCircleQuestion, Radar, Sparkles, Target, TrendingUp } from 'lucide-react';
import { runAnalysis } from '../analysis/engine';
import { aggregateRows, aggregateValues, defaultAggregation, parseMetricValue } from '../analysis/semanticMetrics';
import { useDataStore, useDashboardStore } from '../store/store';
import { applyFilters } from '../utils/chartDataProcessor';

const EMPTY_FILTERS = Object.freeze({});

export default function AnalyticsPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const datasets = useDataStore(state => state.datasets);
  const activeDatasetId = useDataStore(state => state.activeDatasetId);
  const dashboards = useDashboardStore(state => state.dashboards);
  const activeDashboardId = useDashboardStore(state => state.activeDashboardId);
  const activeDashboard = dashboards.find(item => item.id === activeDashboardId);
  const requestedDashboardId = searchParams.get('dashboard');
  const requestedDatasetId = searchParams.get('dataset');
  const datasetId = requestedDatasetId || activeDashboard?.datasetId || activeDatasetId || datasets[0]?.id;
  const dataset = datasets.find(item => item.id === datasetId);
  const availableDashboards = dashboards.filter(item => item.datasetId === dataset?.id);
  const dashboard = requestedDashboardId
    ? availableDashboards.find(item => item.id === requestedDashboardId)
    : !requestedDatasetId && activeDashboard?.datasetId === dataset?.id ? activeDashboard : null;
  const setActiveDashboard = useDashboardStore(state => state.setActiveDashboard);
  const [tab, setTab] = useState('ask');

  const changeContext = (nextDatasetId, nextDashboardId = '') => {
    const params = new URLSearchParams({ dataset: nextDatasetId });
    if (nextDashboardId) params.set('dashboard', nextDashboardId);
    navigate(`/analytics?${params.toString()}`);
    if (nextDashboardId) setActiveDashboard(nextDashboardId);
  };

  const filters = dashboard && dashboard.datasetId === dataset?.id ? dashboard.filters || EMPTY_FILTERS : EMPTY_FILTERS;
  const timeline = dashboard && dashboard.datasetId === dataset?.id ? dashboard.timeline || null : null;
  const filteredRows = dataset ? applyFilters(dataset.sample || [], filters, timeline) : [];
  const analysis = dataset ? runAnalysis(filteredRows, dataset.columns || [], {
    datasetName: dataset.name,
    fileType: dataset.fileType,
    fileSize: dataset.sizeBytes,
    roleOverrides: dataset.roleOverrides || {},
  }) : null;

  if (!dataset) {
    return <div className="page-wrap"><div className="empty-panel"><Activity size={30} /><h2>No dataset to analyze</h2><p>Upload a dataset or open an existing dashboard to see grounded insights and advanced analysis.</p><button className="btn btn-primary" onClick={() => navigate('/upload')}>Upload data <ArrowRight size={15} /></button></div></div>;
  }

  const suggestedQuestions = [
    `Which ${analysis?.classification?.dimensions?.[0]?.column || 'category'} has the highest ${analysis?.classification?.measures?.[0]?.column || 'measure'}?`,
    `What is the average ${analysis?.classification?.measures?.[0]?.column || 'measure'}?`,
    'How many records are in the current data?',
  ];

  return (
    <div className="page-wrap animate-fade-in">
      <section className="page-heading">
        <div>
          <div className="eyebrow"><Sparkles size={14} /> Evidence-led analytics</div>
          <h2>AI insights & advanced analysis</h2>
          <p>Choose a dataset and, optionally, a dashboard to apply its saved filters. Without a dashboard, analysis uses all locally available rows.</p>
        </div>
        <div className="context-selectors">
          <label>Dataset
            <select className="input dataset-select" aria-label="Analytics dataset" value={dataset.id} onChange={event => changeContext(event.target.value)}>
              {datasets.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label>Dashboard filters
            <select className="input dataset-select" aria-label="Analytics dashboard" value={dashboard?.id || ''} onChange={event => changeContext(dataset.id, event.target.value)}>
              <option value="">All rows (no dashboard filters)</option>
              {availableDashboards.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
            </select>
          </label>
          <button className="btn btn-secondary" disabled={!dashboard} onClick={() => {
            setActiveDashboard(dashboard.id);
            navigate(`/dashboard?dataset=${dataset.id}`);
          }}>Open selected dashboard <ArrowRight size={15} /></button>
        </div>
      </section>

      <div className="analytics-context">
        <span><DatabaseMark /> {dataset.name}</span>
        <span>{filteredRows.length.toLocaleString()} of {(dataset.rowCount || dataset.sample?.length || 0).toLocaleString()} rows in context</span>
        {dashboard && (Object.keys(filters).some(key => filters[key]?.length) || timeline) && <span className="badge badge-amber">Filters from {dashboard.title}</span>}
        {(dataset.isSampled || dataset.sample?.length < dataset.rowCount) && <span className="badge badge-cyan">Sample-based</span>}
      </div>

      <div className="tab-row" role="tablist" aria-label="Analytics views">
        <button className={tab === 'ask' ? 'tab-button active' : 'tab-button'} onClick={() => setTab('ask')} role="tab" aria-selected={tab === 'ask'}><MessageCircleQuestion size={15} /> Ask your data</button>
        <button className={tab === 'advanced' ? 'tab-button active' : 'tab-button'} onClick={() => setTab('advanced')} role="tab" aria-selected={tab === 'advanced'}><Radar size={15} /> Advanced analytics</button>
      </div>

      {tab === 'ask' ? (
        <div className="analytics-grid">
          <AskPanel
            key={`${dataset.id}-${dashboard?.id || 'all'}`}
            rows={filteredRows}
            profiles={analysis?.columnProfiles || []}
            filtered={Boolean(Object.keys(filters).length || timeline)}
            suggestedQuestions={suggestedQuestions}
          />
          <section className="panel-section">
            <div className="section-title"><div><h3>Computed signals</h3><p>Descriptive findings generated from the same filtered rows.</p></div><Activity size={18} color="var(--accent-primary)" /></div>
            <div className="signal-list">
              {(analysis?.insights || []).slice(0, 7).map((insight, index) => <article className="signal-item" key={`${insight.title}-${index}`}>
                <span className={`signal-dot ${insight.type || 'info'}`} />
                <div><strong>{insight.title}</strong><p>{insight.body}</p>{insight.evidence && <small>{insight.evidence}</small>}</div>
              </article>)}
              {!analysis?.insights?.length && <p className="muted-copy">There are not enough usable fields or rows to produce descriptive insights.</p>}
            </div>
          </section>
        </div>
      ) : (
        <AdvancedAnalytics key={dataset.id} rows={filteredRows} analysis={analysis} />
      )}
      <div className="explorer-foot"><AlertCircle size={15} /> Correlation is not causation. Forecasts are estimates only; validate assumptions before making decisions.</div>
    </div>
  );
}

function AskPanel({ rows, profiles, filtered, suggestedQuestions }) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState(null);
  const runQuestion = value => {
    if (!value.trim()) return;
    setAnswer(answerQuestion(value, rows, profiles, filtered));
  };

  return (
    <section className="panel-section ask-panel">
      <div className="section-title"><div><h3>Ask a question</h3><p>Structured questions are executed with verified local calculations; no LLM or network request is used.</p></div><Bot size={19} color="var(--accent-cyan)" /></div>
      <form onSubmit={event => { event.preventDefault(); runQuestion(question); }} className="question-form">
        <input className="input" value={question} onChange={event => setQuestion(event.target.value)} placeholder="Which region has the highest revenue?" aria-label="Ask a question about this dataset" />
        <button className="btn btn-primary" type="submit"><Sparkles size={15} /> Analyze</button>
      </form>
      <div className="suggestion-row">{suggestedQuestions.map(item => <button key={item} className="question-suggestion" onClick={() => { setQuestion(item); runQuestion(item); }}>{item}</button>)}</div>
      {answer && <div className={answer.error ? 'answer-card answer-error' : 'answer-card'}>
        <strong>{answer.error ? 'Cannot answer from this data' : answer.title}</strong>
        <p>{answer.text}</p>
        {answer.evidence && <div className="evidence-box"><span>Calculation</span><code>{answer.evidence.formula}</code><span>Evidence</span><code>{answer.evidence.detail}</code></div>}
        <small>{answer.filtered ? 'Uses current dashboard filter context.' : 'Uses all rows available in this browser.'}</small>
      </div>}
    </section>
  );
}

function AdvancedAnalytics({ rows, analysis }) {
  const [whatIf, setWhatIf] = useState('10');
  const profiles = analysis?.columnProfiles || [];
  const measures = profiles.filter(profile => profile.isPotentialMeasure && profile.role !== 'PERCENTAGE');
  const dimensions = profiles.filter(profile => profile.isPotentialDimension);
  const [measureColumn, setMeasureColumn] = useState(measures[0]?.column || '');
  const [dimensionColumn, setDimensionColumn] = useState(dimensions[0]?.column || '');
  const [segmentCount, setSegmentCount] = useState(4);
  const [targetValue, setTargetValue] = useState('');
  const selectedMeasure = measures.find(profile => profile.column === measureColumn) || measures[0];
  const selectedDimension = dimensions.find(profile => profile.column === dimensionColumn) || dimensions[0];

  const pareto = selectedMeasure && selectedDimension
    ? aggregateRows(rows, selectedDimension.column, selectedMeasure.column, defaultAggregation(selectedMeasure), 20)
    : [];
  const paretoTotal = pareto.reduce((sum, item) => sum + (parseMetricValue(item[selectedMeasure?.column]) || 0), 0);
  const paretoWithCumulative = pareto.reduce((result, item) => {
    const previous = result.at(-1)?.running || 0;
    const running = previous + (parseMetricValue(item[selectedMeasure?.column]) || 0);
    result.push({ ...item, running, cumulative: paretoTotal ? running / paretoTotal * 100 : 0 });
    return result;
  }, []);

  const anomalyResults = measures.flatMap(profile => {
    const stats = analysis?.statistics?.[profile.column];
    if (!stats || !stats.iqr) return [];
    return rows.map((row, index) => ({ index, value: parseMetricValue(row[profile.column]), column: profile.column, low: stats.q1 - 1.5 * stats.iqr, high: stats.q3 + 1.5 * stats.iqr }))
      .filter(item => item.value != null && (item.value < item.low || item.value > item.high))
      .slice(0, 12);
  });

  const timeSeries = analysis?.timeSeries?.data || [];
  const forecast = buildForecast(timeSeries, analysis?.timeSeries?.measure);
  const baseValue = selectedMeasure ? aggregateValues(rows.map(row => row[selectedMeasure.column]), defaultAggregation(selectedMeasure)) : null;
  const multiplier = Number(whatIf) / 100;
  const target = Number(targetValue);
  const targetVariance = Number.isFinite(target) && targetValue !== '' && baseValue != null ? baseValue - target : null;
  const segments = selectedMeasure ? buildQuantileSegments(rows, selectedMeasure.column, segmentCount) : [];

  return (
    <div className="advanced-grid">
      <section className="panel-section">
        <div className="section-title"><div><h3>Correlation</h3><p>Pearson correlation, valid pairs only (minimum 3 observations).</p></div><GitBranch size={18} color="var(--accent-primary)" /></div>
        {analysis?.correlations?.significantPairs?.length ? <div className="correlation-list">{analysis.correlations.significantPairs.slice(0, 10).map(pair => <div className="correlation-row" key={`${pair.colA}-${pair.colB}`}><div><strong>{pair.colA}</strong><span>↔</span><strong>{pair.colB}</strong></div><b className={pair.correlation >= 0 ? 'positive' : 'negative'}>{pair.correlation > 0 ? '+' : ''}{pair.correlation.toFixed(3)}</b><small>{pair.strength} {pair.direction} · n={rows.length}</small></div>)}</div> : <p className="muted-copy">No sufficiently strong numeric pairs were found in this context.</p>}
        <small className="analysis-caveat">Correlation does not prove causation and may be influenced by outliers or confounding variables.</small>
      </section>

      <section className="panel-section">
        <div className="section-title"><div><h3>Pareto contribution</h3><p>Top categories ranked by the selected metric; cumulative share is shown.</p></div><Target size={18} color="var(--accent-cyan)" /></div>
        <div className="inline-fields">
          <label>Dimension<select className="input" value={selectedDimension?.column || ''} onChange={event => setDimensionColumn(event.target.value)}>{dimensions.map(profile => <option key={profile.column} value={profile.column}>{profile.column}</option>)}</select></label>
          <label>Metric<select className="input" value={selectedMeasure?.column || ''} onChange={event => setMeasureColumn(event.target.value)}>{measures.map(profile => <option key={profile.column} value={profile.column}>{profile.column}</option>)}</select></label>
        </div>
        {paretoWithCumulative.map(item => <div className="pareto-row" key={item[selectedDimension?.column]}><span>{item[selectedDimension?.column]}</span><div className="pareto-track"><i style={{ width: `${Math.min(100, item.cumulative)}%` }} /></div><strong>{item.cumulative.toFixed(1)}%</strong></div>)}
        {!paretoWithCumulative.length && <p className="muted-copy">Select a numeric metric and category to calculate contribution.</p>}
      </section>

      <section className="panel-section">
        <div className="section-title"><div><h3>Outlier scan</h3><p>IQR fences: Q1 − 1.5×IQR to Q3 + 1.5×IQR.</p></div><Radar size={18} color="var(--accent-amber)" /></div>
        {anomalyResults.length ? <div className="anomaly-list">{anomalyResults.slice(0, 12).map(item => <div key={`${item.column}-${item.index}`}><span>{item.column}</span><strong>{item.value.toLocaleString()}</strong><small>sample row {item.index + 1}</small></div>)}</div> : <p className="muted-copy">No IQR outliers detected, or there are too few numeric observations.</p>}
        <small className="analysis-caveat">An outlier is a statistical flag, not proof of an error or a real-world anomaly.</small>
      </section>

      <section className="panel-section">
        <div className="section-title"><div><h3>Trend forecast</h3><p>Linear trend baseline with holdout backtest where history allows.</p></div><TrendingUp size={18} color="var(--accent-emerald)" /></div>
        {forecast ? <div className="forecast-result"><div className="forecast-stats"><span>Holdout MAPE</span><strong>{forecast.mape == null ? '—' : `${forecast.mape.toFixed(1)}%`}</strong></div><div className="forecast-points">{forecast.points.map(point => <div key={point.label}><span>{point.label}</span><strong>{point.value.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong><small>± {point.margin.toLocaleString(undefined, { maximumFractionDigits: 2 })}</small></div>)}</div><small className="analysis-caveat">Experimental linear extrapolation; no seasonality or causal effects are modeled.</small></div> : <p className="muted-copy">At least 8 ordered time buckets are required for an estimate and holdout test.</p>}
      </section>

      <section className="panel-section">
        <div className="section-title"><div><h3>What-if sandbox</h3><p>Adjust a multiplier without modifying source data.</p></div><Sparkles size={18} color="var(--accent-primary)" /></div>
        {selectedMeasure ? <><label className="range-label">Assumption change: <strong>{Number(whatIf) > 0 ? '+' : ''}{whatIf}%</strong><input type="range" min="-50" max="100" step="1" value={whatIf} onChange={event => setWhatIf(event.target.value)} /></label><div className="whatif-result"><span>Current {selectedMeasure.column}: {formatValue(baseValue)}</span><strong>Scenario: {formatValue((baseValue || 0) * (1 + multiplier))}</strong></div></> : <p className="muted-copy">No eligible numeric measure was detected.</p>}
      </section>

      <section className="panel-section">
        <div className="section-title"><div><h3>Target vs actual</h3><p>Enter a target explicitly; DataVision will not infer one.</p></div><Target size={18} color="var(--accent-emerald)" /></div>
        {selectedMeasure ? <><label className="prep-form">Target for {selectedMeasure.column}<input className="input" type="number" value={targetValue} onChange={event => setTargetValue(event.target.value)} placeholder="Enter target value" /></label>{targetVariance != null && <div className="whatif-result"><span>Actual {formatValue(baseValue)} · Target {formatValue(target)}</span><strong>Variance {targetVariance > 0 ? '+' : ''}{formatValue(targetVariance)}{target ? ` (${(targetVariance / Math.abs(target) * 100).toFixed(1)}%)` : ''}</strong></div>}</> : <p className="muted-copy">No eligible numeric measure was detected.</p>}
      </section>

      <section className="panel-section">
        <div className="section-title"><div><h3>Value segmentation</h3><p>Equal-frequency bands based on one selected numeric field.</p></div><Activity size={18} color="var(--accent-cyan)" /></div>
        {selectedMeasure ? <><label className="prep-form">Segment count<select className="input" value={segmentCount} onChange={event => setSegmentCount(Number(event.target.value))}>{[2, 3, 4, 5, 6, 7, 8].map(count => <option value={count} key={count}>{count} segments</option>)}</select></label><div className="segment-list">{segments.map(segment => <div key={segment.label}><span>{segment.label}</span><strong>{segment.count.toLocaleString()} rows</strong><small>Mean {formatValue(segment.mean)}</small></div>)}</div><small className="analysis-caveat">Segments use only {selectedMeasure.column}, assign valid rows by sorted rank, and are descriptive groups—not predictions or customer profiles.</small></> : <p className="muted-copy">No eligible numeric measure was detected.</p>}
      </section>
    </div>
  );
}

function answerQuestion(question, rows, profiles, filtered) {
  if (!rows.length) return { error: true, title: 'No rows in context', text: 'Clear or adjust the current filters, or choose another dataset.', filtered };
  const query = question.toLowerCase();
  if (/forecast|predict|next month|future/.test(query)) return { error: true, text: 'Use Advanced Analytics for a clearly labeled linear trend estimate; reliable seasonality-aware forecasting needs more history and validation.', filtered };

  const normalizedQuery = query.replace(/[_-]+/g, ' ');
  const dimension = profiles.find(profile => (profile.isPotentialDimension || profile.role === 'ID') && normalizedQuery.includes(profile.column.toLowerCase().replace(/[_-]+/g, ' ')))
    || profiles.find(profile => profile.isPotentialDimension && profile.column.toLowerCase().split(/[_\s-]+/).some(token => token.length > 2 && query.includes(token)))
    || profiles.find(profile => profile.role === 'ID' && profile.column.toLowerCase().split(/[_\s-]+/).some(token => token.length > 2 && query.includes(token)));
  const namedMeasure = profiles.find(profile => profile.isPotentialMeasure && profile.role !== 'ID' && normalizedQuery.includes(profile.column.toLowerCase().replace(/[_-]+/g, ' ')))
    || profiles.find(profile => profile.isPotentialMeasure && profile.role !== 'ID' && profile.column.toLowerCase().split(/[_\s-]+/).some(token => token.length > 2 && query.includes(token)));
  const asksSpecificMeasure = /\b(revenue|sales|profit|price|cost|quantity|amount|salary|score|rate|margin|spend|clicks?|units?)\b/.test(query);
  const measure = namedMeasure || (!asksSpecificMeasure ? profiles.find(profile => profile.role === 'CURRENCY') || profiles.find(profile => profile.role === 'NUMERIC_MEASURE' || profile.role === 'COUNT') : null);

  if (/how many|number of records|count records|total records/.test(query)) {
    return { title: 'Record count', text: `${rows.length.toLocaleString()} records are available in the current context.`, evidence: { formula: 'COUNT(rows)', detail: `${rows.length} rows` }, filtered };
  }
  if (/compare.*(month|period)|this month.*last month|last month.*this month/.test(query)) {
    const dateProfile = profiles.find(profile => ['DATE', 'DATETIME'].includes(profile.role));
    if (!dateProfile || !measure) return { error: true, text: 'A date field and a matching numeric measure are required to compare periods.', filtered };
    const dates = rows.map(row => ({ row, date: new Date(row[dateProfile.column]) })).filter(item => Number.isFinite(item.date.getTime()));
    const buckets = new Map();
    for (const item of dates) {
      const key = `${item.date.getFullYear()}-${String(item.date.getMonth() + 1).padStart(2, '0')}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(item.row);
    }
    const periods = Array.from(buckets.keys()).sort();
    if (periods.length < 2) return { error: true, text: 'At least two distinct months are required for a period comparison.', filtered };
    const latest = periods[periods.length - 1];
    const previous = periods[periods.length - 2];
    const currentValue = aggregateValues(buckets.get(latest).map(row => row[measure.column]), defaultAggregation(measure));
    const previousValue = aggregateValues(buckets.get(previous).map(row => row[measure.column]), defaultAggregation(measure));
    const change = currentValue - previousValue;
    const changePct = previousValue ? change / Math.abs(previousValue) * 100 : null;
    return {
      title: `${latest} compared with ${previous}`,
      text: `${measure.column} was ${formatValue(currentValue)} in the most recent month (${latest}) and ${formatValue(previousValue)} in the prior month (${previous}); change ${change >= 0 ? '+' : ''}${formatValue(change)}${changePct == null ? '' : ` (${changePct.toFixed(1)}%)`}.`,
      evidence: { formula: `${defaultAggregation(measure).toUpperCase()}(${measure.column}) by ${dateProfile.column} month`, detail: `${buckets.get(latest).length} latest-month rows · ${buckets.get(previous).length} previous-month rows` },
      filtered,
    };
  }
  if (!measure && !/how many|record count/.test(query)) {
    return { error: true, text: asksSpecificMeasure ? 'The requested measure was not found. Use a field present in the dataset rather than estimating a missing metric.' : 'This dataset has no suitable numeric or count field for that question. Choose a measurable field or ask for a record count.', filtered };
  }

  const aggregation = /\baverage|mean\b/.test(query) ? 'average'
    : /\bmedian\b/.test(query) ? 'median'
      : /\bminimum|lowest\b/.test(query) ? 'min'
        : /\bmaximum|highest|most|top\b/.test(query) ? 'max'
          : defaultAggregation(measure);

  if (dimension && /\bwhich|highest|lowest|most|top|compare\b/.test(query)) {
    const groups = aggregateRows(rows, dimension.column, measure.column, defaultAggregation(measure), 100);
    const result = groups.reduce((best, current) => !best || (current[measure.column] ?? -Infinity) > (best[measure.column] ?? -Infinity) ? current : best, null);
    if (!result) return { error: true, text: `There are no valid values to compare for ${measure.column}.`, filtered };
    return {
      title: `${result[dimension.column]} has the highest ${measure.column}`,
      text: `${result[dimension.column]} ranks highest for ${measure.column} at ${formatValue(result[measure.column])}.`,
      evidence: { formula: `${defaultAggregation(measure).toUpperCase()}(${measure.column}) grouped by ${dimension.column}`, detail: `${result[dimension.column]} · ${formatValue(result[measure.column])} · ${result.count} records` },
      filtered,
    };
  }

  const value = aggregateValues(rows.map(row => row[measure.column]), aggregation);
  if (value == null) return { error: true, text: `No numeric values were available in ${measure.column}.`, filtered };
  return {
    title: `${aggregation[0].toUpperCase()}${aggregation.slice(1)} ${measure.column}`,
    text: `${aggregation === 'sum' ? 'Total' : aggregation[0].toUpperCase() + aggregation.slice(1)} ${measure.column} is ${formatValue(value)} across ${rows.length.toLocaleString()} rows.`,
    evidence: { formula: `${aggregation.toUpperCase()}(${measure.column})`, detail: `${rows.length} rows · ${rows.filter(row => parseMetricValue(row[measure.column]) != null).length} valid values` },
    filtered,
  };
}

function buildForecast(points, measure) {
  if (!measure || points.length < 8) return null;
  const values = points.map(point => parseMetricValue(point[measure])).filter(value => value != null);
  if (values.length < 8) return null;
  const holdoutSize = Math.max(2, Math.floor(values.length * 0.2));
  const training = values.slice(0, -holdoutSize);
  const model = linearFit(training);
  const errors = values.slice(-holdoutSize).map((actual, index) => Math.abs(actual - (model.intercept + model.slope * (training.length + index))));
  const mapeValues = values.slice(-holdoutSize).map((actual, index) => actual === 0 ? null : errors[index] / Math.abs(actual) * 100).filter(value => value != null);
  const mape = mapeValues.length ? mapeValues.reduce((sum, value) => sum + value, 0) / mapeValues.length : null;
  const margin = errors.reduce((sum, value) => sum + value, 0) / Math.max(errors.length, 1);
  return {
    mape,
    points: Array.from({ length: 3 }, (_, index) => ({
      label: `Next ${index + 1}`,
      value: model.intercept + model.slope * (values.length + index),
      margin: margin * (index + 1),
    })),
  };
}

function linearFit(values) {
  const n = values.length;
  const sumX = n * (n - 1) / 2;
  const sumX2 = n * (n - 1) * (2 * n - 1) / 6;
  const sumY = values.reduce((sum, value) => sum + value, 0);
  const sumXY = values.reduce((sum, value, index) => sum + value * index, 0);
  const denominator = n * sumX2 - sumX * sumX;
  const slope = denominator ? (n * sumXY - sumX * sumY) / denominator : 0;
  return { slope, intercept: (sumY - slope * sumX) / n };
}

function buildQuantileSegments(rows, column, segmentCount) {
  const values = rows.map((row, index) => ({ index, value: parseMetricValue(row[column]) }))
    .filter(item => item.value != null)
    .sort((left, right) => left.value - right.value);
  const segments = Array.from({ length: segmentCount }, (_, index) => ({ label: `Segment ${index + 1}`, count: 0, sum: 0, min: Infinity, max: -Infinity }));
  values.forEach((item, index) => {
    const bucket = Math.min(segmentCount - 1, Math.floor(index * segmentCount / values.length));
    const segment = segments[bucket];
    segment.count++;
    segment.sum += item.value;
    segment.min = Math.min(segment.min, item.value);
    segment.max = Math.max(segment.max, item.value);
  });
  return segments.filter(segment => segment.count > 0).map(segment => ({
    ...segment,
    mean: segment.sum / segment.count,
  }));
}

function formatValue(value) {
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function DatabaseMark() {
  return <span aria-hidden="true">◈</span>;
}
