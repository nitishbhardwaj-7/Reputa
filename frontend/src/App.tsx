import { Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "./components/Layout";
import { RequireAuth, RedirectIfAuthed } from "./auth/RequireAuth";
import { LandingPage } from "./pages/LandingPage";
import { PricingPage } from "./pages/PricingPage";
import { LoginPage } from "./pages/LoginPage";
import { SignupPage } from "./pages/SignupPage";
import { OnboardingPage } from "./pages/OnboardingPage";
import { OverviewPage } from "./pages/OverviewPage";
import { MentionsPage } from "./pages/MentionsPage";
import { AlertsPage } from "./pages/AlertsPage";
import { SourcesPage } from "./pages/SourcesPage";
import { ReportsPage } from "./pages/ReportsPage";
import { CompetitorsPage } from "./pages/CompetitorsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { BillingPage } from "./pages/BillingPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/pricing" element={<PricingPage />} />
      <Route path="/login" element={<RedirectIfAuthed><LoginPage /></RedirectIfAuthed>} />
      <Route path="/signup" element={<RedirectIfAuthed><SignupPage /></RedirectIfAuthed>} />

      <Route element={<RequireAuth />}>
        <Route path="/app/onboarding" element={<OnboardingPage />} />
        <Route path="/app" element={<Layout />}>
          <Route index element={<OverviewPage />} />
          <Route path="mentions" element={<MentionsPage />} />
          <Route path="alerts" element={<AlertsPage />} />
          <Route path="sources" element={<SourcesPage />} />
          <Route path="competitors" element={<CompetitorsPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="billing" element={<BillingPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
