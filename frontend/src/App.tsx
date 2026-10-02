import { Routes, Route } from "react-router-dom";
import { Layout } from "./components/Layout";
import { OverviewPage } from "./pages/OverviewPage";
import { ExplorerPage } from "./pages/ExplorerPage";
import { SentimentSectionPage } from "./pages/SentimentSectionPage";
import { SearchPage } from "./pages/SearchPage";
import { FailedPage } from "./pages/FailedPage";
import { SettingsPage } from "./pages/SettingsPage";
import { ManualScraperPage } from "./pages/ManualScraperPage";
import { GoogleScraperPage } from "./pages/GoogleScraperPage";
import { CompetitorDashboardPage } from "./pages/CompetitorDashboardPage";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<OverviewPage />} />
        <Route path="explorer" element={<ExplorerPage />} />
        <Route path="manual-scraper" element={<ManualScraperPage />} />
        <Route path="competitor-dashboard" element={<CompetitorDashboardPage />} />
        <Route path="competitor-analysis" element={<CompetitorDashboardPage />} />
        <Route path="google-scraper" element={<GoogleScraperPage />} />
        <Route path="negative" element={<SentimentSectionPage title="Negative Mentions" kind="negative" />} />
        <Route path="neutral" element={<SentimentSectionPage title="Neutral Mentions" kind="neutral" />} />
        <Route path="positive" element={<SentimentSectionPage title="Positive Mentions" kind="positive" />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="failed" element={<FailedPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}
