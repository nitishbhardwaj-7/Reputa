import { Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "./components/Layout";
import { RequireAuth, RedirectIfAuthed } from "./auth/RequireAuth";
import { LandingPage } from "./pages/LandingPage";
import { LoginPage } from "./pages/LoginPage";
import { SignupPage } from "./pages/SignupPage";
import { OnboardingPage } from "./pages/OnboardingPage";
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
      {/* Public */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<RedirectIfAuthed><LoginPage /></RedirectIfAuthed>} />
      <Route path="/signup" element={<RedirectIfAuthed><SignupPage /></RedirectIfAuthed>} />

      {/* Signed-in workspace */}
      <Route element={<RequireAuth />}>
        <Route path="/app/onboarding" element={<OnboardingPage />} />
        <Route path="/app" element={<Layout />}>
          <Route index element={<OverviewPage />} />
          <Route path="mentions" element={<ExplorerPage />} />
          <Route path="keywords" element={<ManualScraperPage />} />
          <Route path="competitors" element={<CompetitorDashboardPage />} />
          <Route path="search-monitor" element={<GoogleScraperPage />} />
          <Route path="negative" element={<SentimentSectionPage title="Negative Mentions" kind="negative" />} />
          <Route path="neutral" element={<SentimentSectionPage title="Neutral Mentions" kind="neutral" />} />
          <Route path="positive" element={<SentimentSectionPage title="Positive Mentions" kind="positive" />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="failed" element={<FailedPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
