import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Database, GitMerge, RotateCcw, Save, Search, ShieldCheck, Sparkles, WandSparkles } from 'lucide-react';
import { runAnalysis } from '../analysis/engine';
import { useDataStore } from '../store/store';
import { joinDatasets, runTransformationPipeline } from '../utils/dataPreparation';

const ROLES = ['ID', 'CATEGORICAL_DIMENSION', 'NUMERIC_MEASURE', 'CURRENCY', 'PERCENTAGE', 'COUNT', 'DURATION', 'DATE', 'DATETIME', 'YEAR', 'BOOLEAN', 'GEOGRAPHIC', 'TEXT', 'UNKNOWN'];
const OPERATIONS = [
  ['remove_duplicates', 'Remove duplicate rows'],
  ['drop_missing', 'Remove rows missing a value'],
  ['fill_missing', 'Fill missing values'],
  ['rename', 'Rename a column'],
  ['convert_type', 'Convert a column type'],
  ['filter_rows', 'Filter rows'],
  ['split_column', 'Split a column'],
  ['merge_columns', 'Merge two columns'],
  ['calculate_column', 'Add a calculated column'],
];

const selectStyle = { background: 'var(--bg-base)', color: 'var(--text-primary)', border: '1px solid var(--border-default)', borderRadius: 8, padding: '9px 10px', minWidth: 0 };

export default function ExplorerPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const datasets = useDataStore(state => state.datasets);
  const activeDatasetId = useDataStore(state => state.activeDatasetId);
  const setActiveDataset = useDataStore(state => state.setActiveDataset);
  const updateDataset = useDataStore(state => state.updateDataset);
  const addDerivedDataset = useDataStore(state => state.addDerivedDataset);
  const requestedDatasetId = searchParams.get('dataset');
  const dataset = datasets.find(item => item.id === requestedDatasetId)
    || datasets.find(item => item.id === activeDatasetId)
    || datasets[0];
  const sampleRows = useMemo(() => Array.isArray(dataset?.sample)
    ? dataset.sample.filter(row => row && typeof row === 'object' && !Array.isArray(row))
    : [], [dataset?.sample]);
  const columns = useMemo(() => Array.isArray(dataset?.columns)
    ? dataset.columns
    : Object.keys(sampleRows[0] || {}), [dataset?.columns, sampleRows]);

  const [operation, setOperation] = useState('remove_duplicates');
  const [column, setColumn] = useState('');
  const [secondColumn, setSecondColumn] = useState('');
  const [value, setValue] = useState('');
  const [newName, setNewName] = useState('');
  const [delimiter, setDelimiter] = useState(',');
  const [leftName, setLeftName] = useState('');
  const [rightName, setRightName] = useState('');
  const [expression, setExpression] = useState('');
  const [operator, setOperator] = useState('equals');
  const [steps, setSteps] = useState([]);
  const [redoSteps, setRedoSteps] = useState([]);
  const [error, setError] = useState('');
  const [fieldSearch, setFieldSearch] = useState('');
  const [otherDatasetId, setOtherDatasetId] = useState('');
  const [leftKey, setLeftKey] = useState('');
  const [rightKey, setRightKey] = useState('');
  const [joinMode, setJoinMode] = useState('left');

  const analysisResult = useMemo(() => {
    if (!dataset) return null;
    try {
      return {
        analysis: runAnalysis(sampleRows, columns, {
          datasetName: dataset.name,
          fileType: dataset.fileType,
          fileSize: dataset.sizeBytes,
          roleOverrides: dataset.roleOverrides || {},
        }),
        error: '',
      };
    } catch (caught) {
      console.error('Dataset Explorer analysis failed:', caught);
      return { analysis: null, error: caught instanceof Error ? caught.message : String(caught) };
    }
  }, [dataset, sampleRows, columns]);
  const analysis = analysisResult?.analysis;
  const visibleProfiles = useMemo(() => (analysis?.columnProfiles || []).filter(profile => {
    const query = fieldSearch.trim().toLowerCase();
    return !query || profile.column.toLowerCase().includes(query)
      || (profile.displayName || '').toLowerCase().includes(query)
      || roleLabel(profile.role).toLowerCase().includes(query);
  }), [analysis?.columnProfiles, fieldSearch]);

  const preparedColumns = useMemo(() => steps.reduce((columns, step) => {
    if (step.type === 'rename') return columns.map(item => item === step.column ? step.newName.trim() : item);
    if (step.type === 'split_column') return [...columns, step.leftName.trim(), step.rightName.trim()];
    if (step.type === 'merge_columns' || step.type === 'calculate_column') return [...columns, step.newName.trim()];
    return columns;
  }, [...columns]), [steps, columns]);

  const preparedResult = useMemo(() => {
    if (!dataset) return { rows: [], error: '' };
    try {
      return { rows: runTransformationPipeline(sampleRows, columns, steps), error: '' };
    } catch (caught) {
      return { rows: [], error: caught.message };
    }
  }, [dataset, sampleRows, columns, steps]);
  const preparedRows = preparedResult.rows;

  const otherDataset = datasets.find(item => item.id === otherDatasetId);
  const joinPreview = useMemo(() => {
    if (!dataset || !otherDataset || !leftKey || !rightKey) return null;
    return joinDatasets(dataset, otherDataset, leftKey, rightKey, joinMode);
  }, [dataset, otherDataset, leftKey, rightKey, joinMode]);
  const relationshipSuggestions = useMemo(() => {
    if (!dataset) return [];
    const keys = columns.filter(column => {
      const profile = analysis?.columnProfiles?.find(item => item.column === column);
      return profile?.isCandidateKey || profile?.role === 'ID';
    });
    return datasets.filter(item => item.id !== dataset.id).flatMap(candidate => {
      const matches = [];
      for (const left of keys) {
        const leftName = left.toLowerCase().replace(/[^a-z0-9]/g, '');
        for (const right of candidate.columns) {
          if (leftName !== right.toLowerCase().replace(/[^a-z0-9]/g, '')) continue;
          matches.push({ datasetId: candidate.id, datasetName: candidate.name, leftKey: left, rightKey: right });
        }
      }
      return matches.slice(0, 2);
    }).slice(0, 4);
  }, [dataset, datasets, analysis, columns]);

  if (!dataset) {
    return (
      <div className="page-wrap">
        <EmptyState title="Choose a dataset to explore" detail="Import CSV, Excel or JSON data to inspect its quality, dictionary and transformation options." onClick={() => navigate('/upload')} />
      </div>
    );
  }

  const setRoleOverride = (field, key, fieldValue) => {
    const roleOverrides = {
      ...(dataset.roleOverrides || {}),
      [field]: { ...(dataset.roleOverrides?.[field] || {}), [key]: fieldValue },
    };
    updateDataset(dataset.id, { roleOverrides });
  };

  const resetRole = field => {
    const roleOverrides = { ...(dataset.roleOverrides || {}) };
    if (!roleOverrides[field]) return;
    const metadata = { ...roleOverrides[field] };
    delete metadata.role;
    if (Object.keys(metadata).length) roleOverrides[field] = metadata;
    else delete roleOverrides[field];
    updateDataset(dataset.id, { roleOverrides });
  };

  const addStep = () => {
    const step = { type: operation };
    if (['drop_missing', 'fill_missing', 'rename', 'convert_type', 'filter_rows', 'split_column'].includes(operation)) step.column = column;
    if (operation === 'fill_missing') step.value = value;
    if (operation === 'rename') step.newName = newName;
    if (operation === 'convert_type') step.to = value;
    if (operation === 'filter_rows') Object.assign(step, { value, operator });
    if (operation === 'split_column') Object.assign(step, { delimiter, leftName, rightName });
    if (operation === 'merge_columns') Object.assign(step, { column, secondColumn, newName, delimiter });
    if (operation === 'calculate_column') Object.assign(step, { newName, expression });

    try {
      if (['drop_missing', 'fill_missing', 'rename', 'convert_type', 'filter_rows', 'split_column', 'merge_columns'].includes(operation) && !column) throw new Error('Choose a column first.');
      if (operation === 'convert_type' && !value) throw new Error('Choose a target type.');
      if (operation === 'merge_columns' && !secondColumn) throw new Error('Choose a second field.');
      if (operation === 'filter_rows' && operator !== 'not_empty' && !value) throw new Error('Enter a value for this filter.');
      if (operation === 'calculate_column' && !expression.trim()) throw new Error('Enter a formula first.');
      runTransformationPipeline(sampleRows, columns, [...steps, step]);
      setSteps(current => [...current, step]);
      setRedoSteps([]);
      setError('');
      setValue('');
      setNewName('');
      setExpression('');
    } catch (caught) {
      setError(caught.message);
    }
  };

  const savePrepared = () => {
    if (preparedResult.error) {
      setError(preparedResult.error);
      return;
    }
    if (!steps.length) {
      setError('Add at least one transformation before saving a derived dataset.');
      return;
    }
    try {
      const derivedId = addDerivedDataset(dataset, preparedRows, preparedColumns, steps);
      navigate(`/dashboard?dataset=${derivedId}&new=true`);
    } catch (caught) {
      setError(caught.message);
    }
  };

  const saveJoin = () => {
    if (!joinPreview) return;
    if (joinPreview.rows.length === 0) {
      setError('The selected join produced no matching rows. Choose another key or join mode.');
      return;
    }
    const joined = {
      ...dataset,
      name: `${dataset.name} + ${otherDataset.name}`,
      columns: joinPreview.columns,
    };
    const derivedId = addDerivedDataset(joined, joinPreview.rows, joinPreview.columns, [{
      type: 'join',
      leftDatasetId: dataset.id,
      rightDatasetId: otherDataset.id,
      leftKey,
      rightKey,
      mode: joinMode,
      warning: joinPreview.multiplyMatched ? `${joinPreview.multiplyMatched} additional rows from non-unique join keys` : '',
    }]);
    if (joinPreview.isSampled) updateDataset(derivedId, { isSampled: true });
    navigate(`/explorer?dataset=${derivedId}`);
  };

  return (
    <div className="page-wrap animate-fade-in">
      <section className="page-heading">
        <div>
          <div className="eyebrow"><Database size={14} /> Data intelligence</div>
          <h2>Explore your dataset</h2>
          <p>Inspect inferred meaning, data quality and safely prepare a derived version without changing the source upload.</p>
        </div>
        <select className="input dataset-select" value={dataset.id} onChange={event => {
          setActiveDataset(event.target.value);
          navigate(`/explorer?dataset=${event.target.value}`);
          setSteps([]);
          setRedoSteps([]);
        }}>
          {datasets.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </section>

      <div className="metric-strip">
        <Metric label="Rows" value={(dataset.rowCount || sampleRows.length).toLocaleString()} note={`${sampleRows.length} rows available in this browser`} />
        <Metric label="Fields" value={columns.length} note="Editable data dictionary" />
        <Metric label="Quality score" value={`${analysis?.dataQuality?.qualityScore ?? 0}/100`} note="Based on the available sample" />
        <Metric label="Detected domain" value={analysis?.domain || 'General'} note={`${Math.round((analysis?.domainConfidence || 0) * 100)}% confidence from field names`} />
      </div>

      {analysisResult?.error && (
        <div className="inline-error" role="alert">This dataset could not be analyzed: {analysisResult.error}. Check the saved dataset fields or re-import the file.</div>
      )}

      {(dataset.isSampled || sampleRows.length < (dataset.rowCount || 0)) && (
        <div className="notice-banner"><ShieldCheck size={16} /> This browser holds a sample ({sampleRows.length.toLocaleString()} of {(dataset.rowCount || 0).toLocaleString()} rows). Profile statistics and transformations are sample-based, not full-dataset estimates.</div>
      )}

      <section className="panel-section dictionary-section">
        <div className="section-title">
          <div><h3>Data dictionary</h3><p>Review how each field is interpreted. Changes are saved automatically and affect future dashboard analysis.</p></div>
          <span className="badge badge-cyan">{visibleProfiles.length} of {analysis?.columnProfiles?.length || 0} fields</span>
        </div>
        <label className="dictionary-search">
          <Search size={16} aria-hidden="true" />
          <input className="input" type="search" value={fieldSearch} onChange={event => setFieldSearch(event.target.value)} placeholder="Search fields by name or type" aria-label="Search data dictionary fields" />
        </label>
        <div className="field-card-grid">
          {visibleProfiles.map(profile => {
            const override = dataset.roleOverrides?.[profile.column] || {};
            const statistic = analysis?.statistics?.[profile.column];
            const profileSummary = statistic
              ? `Min ${formatMetric(statistic.min)} · Median ${formatMetric(statistic.median)} · Max ${formatMetric(statistic.max)} · ${statistic.outlierCount} outliers`
              : profile.dateRange
                ? `${profile.dateRange.min.toLocaleDateString()} – ${profile.dateRange.max.toLocaleDateString()}`
                : (profile.topValues || []).slice(0, 3).map(item => item.value).join(', ') || 'No profile summary';
            return (
              <article className="field-card" key={profile.column}>
                <div className="field-card-heading">
                  <div><h4>{profile.displayName || profile.column}</h4><span className="field-source-name">{profile.column}</span></div>
                  <span className="field-confidence">{Math.round(profile.confidence * 100)}% confidence</span>
                </div>
                <div className="field-card-controls">
                  <label>Field type
                    <select value={override.role || profile.role} onChange={event => setRoleOverride(profile.column, 'role', event.target.value)} aria-label={`Role for ${profile.column}`}>
                      {ROLES.map(role => <option key={role} value={role}>{roleLabel(role)}</option>)}
                    </select>
                  </label>
                  <label>Display name
                    <input className="input" value={override.displayName ?? profile.displayName ?? profile.column} onChange={event => setRoleOverride(profile.column, 'displayName', event.target.value)} aria-label={`Display name for ${profile.column}`} />
                  </label>
                  <label>Unit (optional)
                    <input className="input" value={override.unit || ''} onChange={event => setRoleOverride(profile.column, 'unit', event.target.value)} aria-label={`Unit for ${profile.column}`} placeholder="e.g. USD or %" />
                  </label>
                </div>
                <div className="field-card-stats">
                  <span><strong>{profile.uniqueCount.toLocaleString()}</strong> unique</span>
                  <span><strong>{profile.missingCount.toLocaleString()}</strong> missing ({profile.missingPct.toFixed(1)}%)</span>
                  <span className="field-data-type">{profile.dataType}</span>
                </div>
                <p className="field-profile-summary">{profileSummary}</p>
                {override.role && <button className="btn btn-ghost btn-sm field-reset" onClick={() => resetRole(profile.column)}>Reset to detected type</button>}
              </article>
            );
          })}
          {visibleProfiles.length === 0 && <p className="muted-copy dictionary-no-results">No fields match “{fieldSearch}”. Try another name or type.</p>}
        </div>
        <div className="profile-footnote">
          <span>{(analysis?.dataQuality?.duplicateRows || 0).toLocaleString()} duplicate rows in the available sample</span>
          <span>{(analysis?.dataQuality?.totalMissing || 0).toLocaleString()} missing cells across {columns.length} fields</span>
        </div>
      </section>

      <section className="prep-grid">
        <div className="panel-section">
          <div className="section-title">
            <div><h3>Preparation studio</h3><p>Build a reversible pipeline and preview its effect before saving.</p></div>
            <WandSparkles size={18} color="var(--accent-cyan)" />
          </div>
          <div className="prep-form">
            <label>Transformation
              <select value={operation} onChange={event => setOperation(event.target.value)} style={selectStyle}>
                {OPERATIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
            </label>
            {operation !== 'remove_duplicates' && <label>Column
              <select value={column} onChange={event => setColumn(event.target.value)} style={selectStyle}>
                <option value="">Choose field</option>{preparedColumns.map(item => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>}
            {operation === 'fill_missing' && <label>Replacement value<input className="input" value={value} onChange={event => setValue(event.target.value)} placeholder="Value to use for blanks" /></label>}
            {operation === 'rename' && <label>New field name<input className="input" value={newName} onChange={event => setNewName(event.target.value)} /></label>}
            {operation === 'convert_type' && <label>Convert to
              <select value={value} onChange={event => setValue(event.target.value)} style={selectStyle}>
                <option value="">Select type</option><option value="number">Number</option><option value="date">Date</option><option value="boolean">Boolean</option><option value="text">Text</option>
              </select>
            </label>}
            {operation === 'filter_rows' && <>
              <label>Condition<select value={operator} onChange={event => setOperator(event.target.value)} style={selectStyle}><option value="equals">Equals</option><option value="contains">Contains</option><option value="greater_than">Greater than</option><option value="less_than">Less than</option><option value="not_empty">Is not empty</option></select></label>
              {operator !== 'not_empty' && <label>Match value<input className="input" value={value} onChange={event => setValue(event.target.value)} /></label>}
            </>}
            {operation === 'split_column' && <>
              <label>Delimiter<input className="input" value={delimiter} onChange={event => setDelimiter(event.target.value)} /></label>
              <label>New field names<div className="inline-fields"><input className="input" value={leftName} onChange={event => setLeftName(event.target.value)} placeholder="First part" /><input className="input" value={rightName} onChange={event => setRightName(event.target.value)} placeholder="Remaining part" /></div></label>
            </>}
            {operation === 'merge_columns' && <>
              <label>Second field<select value={secondColumn} onChange={event => setSecondColumn(event.target.value)} style={selectStyle}><option value="">Choose field</option>{preparedColumns.filter(item => item !== column).map(item => <option key={item} value={item}>{item}</option>)}</select></label>
              <label>New name<input className="input" value={newName} onChange={event => setNewName(event.target.value)} /></label>
              <label>Separator<input className="input" value={delimiter} onChange={event => setDelimiter(event.target.value)} /></label>
            </>}
            {operation === 'calculate_column' && <>
              <label>New field name<input className="input" value={newName} onChange={event => setNewName(event.target.value)} /></label>
              <label>Formula<input className="input" value={expression} onChange={event => setExpression(event.target.value)} placeholder="[Quantity] * [Unit Price]" /><small>Safe arithmetic only; reference columns in [brackets].</small></label>
            </>}
            <button className="btn btn-secondary" onClick={addStep}><WandSparkles size={15} /> Add to pipeline</button>
          </div>
          {error && <div className="inline-error" role="alert">{error}</div>}
          <div className="pipeline-list">
            <div className="pipeline-heading"><strong>Pipeline</strong><div><button className="btn btn-ghost btn-sm" onClick={() => {
              const last = steps.at(-1);
              if (!last) return;
              setSteps(current => current.slice(0, -1));
              setRedoSteps(current => [...current, last]);
              setError('');
            }} disabled={!steps.length}><RotateCcw size={13} /> Undo</button><button className="btn btn-ghost btn-sm" onClick={() => {
              const next = redoSteps.at(-1);
              if (!next) return;
              try {
                runTransformationPipeline(sampleRows, columns, [...steps, next]);
                setSteps(current => [...current, next]);
                setRedoSteps(current => current.slice(0, -1));
                setError('');
              } catch (caught) {
                setError(caught.message);
              }
            }} disabled={!redoSteps.length}>Redo</button></div></div>
            {steps.length === 0 ? <p className="muted-copy">No transformations yet. Your uploaded data remains untouched.</p> : steps.map((step, index) => <div className="pipeline-step" key={`${step.type}-${index}`}><span>{String(index + 1).padStart(2, '0')}</span><div><strong>{OPERATIONS.find(([key]) => key === step.type)?.[1] || 'Join datasets'}</strong><small>{step.column || step.newName || step.type}</small></div><button aria-label={`Remove step ${index + 1}`} onClick={() => { setSteps(current => current.filter((_, stepIndex) => stepIndex !== index)); setRedoSteps([]); }}>×</button></div>)}
          </div>
            {preparedResult.error && <div className="inline-error" role="alert">{preparedResult.error}</div>}
            <div className="prep-savebar"><span>{preparedRows.length.toLocaleString()} preview rows · {preparedColumns.length} fields</span><button className="btn btn-primary btn-sm" onClick={savePrepared} disabled={!steps.length || Boolean(preparedResult.error)}><Save size={14} /> Save as derived version</button></div>
        </div>

        <div className="panel-section">
          <div className="section-title">
            <div><h3>Join tables</h3><p>Join another saved dataset on explicit keys; row multiplication is reported before saving.</p></div>
            <GitMerge size={18} color="var(--accent-primary)" />
          </div>
          {relationshipSuggestions.length > 0 && <div className="relationship-suggestions"><span>Likely key matches</span>{relationshipSuggestions.map(item => <button key={`${item.datasetId}-${item.leftKey}`} className="question-suggestion" onClick={() => { setOtherDatasetId(item.datasetId); setLeftKey(item.leftKey); setRightKey(item.rightKey); }}>{item.leftKey} ↔ {item.datasetName}.{item.rightKey}</button>)}</div>}
          <div className="prep-form">
            <label>Other dataset<select className="input" value={otherDatasetId} onChange={event => setOtherDatasetId(event.target.value)}><option value="">Choose dataset</option>{datasets.filter(item => item.id !== dataset.id).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            {otherDataset && <div className="inline-fields">
              <label>Current key<select value={leftKey} onChange={event => setLeftKey(event.target.value)} style={selectStyle}><option value="">Choose key</option>{columns.map(item => <option key={item} value={item}>{item}</option>)}</select></label>
              <label>Other key<select value={rightKey} onChange={event => setRightKey(event.target.value)} style={selectStyle}><option value="">Choose key</option>{otherDataset.columns.map(item => <option key={item} value={item}>{item}</option>)}</select></label>
            </div>}
            <label>Join type<select value={joinMode} onChange={event => setJoinMode(event.target.value)} style={selectStyle}><option value="left">Left join</option><option value="inner">Inner join</option></select></label>
          </div>
          {joinPreview && <div className="join-summary">
            <div><strong>{joinPreview.rows.length.toLocaleString()}</strong><small>matched rows from available samples</small></div>
            <div><strong>{joinPreview.unmatched.toLocaleString()}</strong><small>unmatched left keys</small></div>
            <div><strong>{joinPreview.multiplyMatched.toLocaleString()}</strong><small>additional rows from duplicate right-side keys</small></div>
            {joinPreview.isSampled && <p className="notice-banner">At least one dataset is sampled; join counts are estimates and saved output contains only available rows.</p>}
            <button className="btn btn-primary btn-sm" onClick={saveJoin}><GitMerge size={14} /> Save joined dataset</button>
          </div>}
        </div>
      </section>

      <section className="panel-section preview-section">
        <div className="section-title"><div><h3>Prepared preview</h3><p>First 20 rows after the current pipeline.</p></div><span className="badge badge-emerald">{steps.length} steps</span></div>
        <div className="table-scroll">
          <table className="data-table"><thead><tr>{preparedColumns.map(item => <th key={item}>{item}</th>)}</tr></thead>
            <tbody>{preparedRows.slice(0, 20).map((row, index) => <tr key={index}>{preparedColumns.map(item => <td key={item}>{String(row[item] ?? '—')}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </section>

      <div className="explorer-foot"><Sparkles size={15} /> Local analysis only — no rows are uploaded to an AI service.</div>
    </div>
  );
}

function Metric({ label, value, note }) {
  return <div className="metric-card"><span>{label}</span><strong>{value}</strong><small>{note}</small></div>;
}

function EmptyState({ title, detail, onClick }) {
  return <div className="empty-panel"><Database size={30} /><h2>{title}</h2><p>{detail}</p><button className="btn btn-primary" onClick={onClick}>Import data <ArrowRight size={15} /></button></div>;
}

function formatMetric(value) {
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function roleLabel(role) {
  const labels = {
    ID: 'Identifier',
    CATEGORICAL_DIMENSION: 'Category',
    NUMERIC_MEASURE: 'Number / measure',
    CURRENCY: 'Currency',
    PERCENTAGE: 'Percentage',
    COUNT: 'Count',
    DURATION: 'Duration',
    DATE: 'Date',
    DATETIME: 'Date and time',
    YEAR: 'Year',
    BOOLEAN: 'True / false',
    GEOGRAPHIC: 'Location',
    TEXT: 'Text',
    UNKNOWN: 'Unknown',
  };
  return labels[role] || role;
}
