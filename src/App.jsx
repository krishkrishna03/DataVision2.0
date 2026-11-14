import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Analytics } from "@vercel/analytics/react";

import AppShell from './components/layout/AppShell';
import LandingPage from './pages/LandingPage';
import UploadPage from './pages/UploadPage';
import DashboardEditor from './pages/DashboardEditor';
import DashboardGallery from './pages/DashboardGallery';
import TemplateGallery from './pages/TemplateGallery';
import DatasetGallery from './pages/DatasetGallery';
import ExplorerPage from './pages/ExplorerPage';
import AnalyticsPage from './pages/AnalyticsPage';
import ReportsPage from './pages/ReportsPage';

function App() {
  return (
    <BrowserRouter>
      <Analytics />

      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<LandingPage />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/dashboard" element={<DashboardEditor />} />
          <Route path="/dashboards" element={<DashboardGallery />} />
          <Route path="/templates" element={<TemplateGallery />} />
          <Route path="/datasets" element={<DatasetGallery />} />
          <Route path="/explorer" element={<ExplorerPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/reports" element={<ReportsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
