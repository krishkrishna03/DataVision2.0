import { createElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, ArrowRight, BarChart3, Database, FileCheck2, LockKeyhole, Sparkles, UploadCloud } from 'lucide-react';
import { useDataStore, useDashboardStore } from '../store/store';

const FEATURES = [
  { icon: Database, title: 'Understand every field', body: 'Profile missing values, cardinality, distributions and semantic roles before charting.', tone: 'indigo' },
  { icon: BarChart3, title: 'Trust the numbers', body: 'Use meaningful aggregations for identifiers, rates, unit prices and financial measures.', tone: 'cyan' },
  { icon: Activity, title: 'Explore what matters', body: 'Filter dashboards, compare categories, inspect outliers and test a trend scenario.', tone: 'green' },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const datasets = useDataStore(state => state.datasets);
  const dashboards = useDashboardStore(state => state.dashboards);
  const mostRecent = dashboards[0];

  return (
    <div className="landing-page animate-fade-in">
      <section className="hero-panel">
        <div className="hero-copy">
          <div className="eyebrow hero-eyebrow"><Sparkles size={14} /> DataVision · Business intelligence</div>
          <h1>From raw data to <span className="gradient-text">confident decisions.</span></h1>
          <p>Explore your data, check what each field means, and build dashboards with metrics you can explain. Your uploaded data stays in this browser.</p>
          <div className="hero-actions">
            <button className="btn btn-primary btn-lg" onClick={() => navigate('/upload')}><UploadCloud size={17} /> Start with data <ArrowRight size={16} /></button>
            {mostRecent ? <button className="btn btn-secondary btn-lg" onClick={() => { useDashboardStore.getState().setActiveDashboard(mostRecent.id); navigate('/dashboard'); }}>Continue dashboard</button> : <button className="btn btn-secondary btn-lg" onClick={() => navigate('/explorer')}>Explore tools</button>}
          </div>
          <div className="trust-row"><span><FileCheck2 size={14} /> Explainable calculations</span><span><LockKeyhole size={14} /> Local-first by design</span></div>
        </div>
        <div className="hero-visual" aria-hidden="true">
          <div className="visual-glow" />
          <div className="visual-window">
            <div className="visual-window-top"><span /><span /><span /><b>Revenue overview</b></div>
            <div className="visual-kpis"><div><small>Net sales</small><strong>$248.6k</strong><i>verified sum</i></div><div><small>Orders</small><strong>1,842</strong><i>distinct IDs</i></div></div>
            <div className="visual-chart"><div className="chart-axis"><span>250k</span><span>125k</span><span>0</span></div><div className="chart-bars">{[42, 63, 48, 78, 57, 91, 73].map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}</div></div>
            <div className="visual-insight"><Sparkles size={13} /> Revenue is up in the top-performing segment</div>
          </div>
        </div>
      </section>

      <section className="landing-overview">
        <div className="landing-section-head"><div><span className="eyebrow">A guided workflow</span><h2>Clarity at every step</h2></div><p>Go from a file to useful answers while keeping the calculation rules visible.</p></div>
        <div className="feature-cards">{FEATURES.map(({ icon, title, body, tone }, index) => <article className={`feature-card ${tone}`} key={title}><div className="feature-icon">{createElement(icon, { size: 20 })}</div><span className="feature-step">0{index + 1}</span><h3>{title}</h3><p>{body}</p></article>)}</div>
      </section>

      <section className="landing-bottom">
        <div><h2>Your workspace, at a glance</h2><p>Datasets and dashboard definitions are persisted locally in this browser.</p></div>
        <div className="workspace-stats"><div><strong>{datasets.length}</strong><span>Datasets</span></div><div><strong>{dashboards.length}</strong><span>Dashboards</span></div><button className="btn btn-ghost" onClick={() => navigate('/datasets')}>View workspace <ArrowRight size={14} /></button></div>
      </section>
    </div>
  );
}
