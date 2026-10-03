import { useEffect, useState, type FormEvent } from "react";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import type { PlatformStatus } from "../api/types";

export function SettingsPage() {
  const { user, organization, setOrganization, setUser } = useAuth();
  const [orgName, setOrgName] = useState(organization?.name ?? "");
  const [brandName, setBrandName] = useState(organization?.brandName ?? "");
  const [alertEmails, setAlertEmails] = useState((organization?.alertEmails ?? []).join(", "));
  const [platform, setPlatform] = useState<PlatformStatus | null>(null);
  const [displayName, setDisplayName] = useState(user?.name ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    api.getSettings().then((r) => { setOrgName(r.organization.name); setBrandName(r.organization.brandName); setAlertEmails(r.organization.alertEmails.join(", ")); setPlatform(r.platform); setOrganization(r.organization); }).catch(() => {});
  }, [setOrganization]);

  const flash = (ok: boolean, text: string) => { setMsg({ ok, text }); window.setTimeout(() => setMsg(null), 4500); };
  async function go(key: string, fn: () => Promise<void>, ok: string) {
    setBusy(key);
    try { await fn(); flash(true, ok); } catch (e: any) { flash(false, e?.message || "Something went wrong."); } finally { setBusy(null); }
  }

  const saveOrg = (e: FormEvent) => { e.preventDefault(); go("org", async () => {
    const emails = alertEmails.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
    const r = await api.updateSettings({ name: orgName, brandName, alertEmails: emails });
    setOrganization(r.organization); setAlertEmails(r.organization.alertEmails.join(", "));
  }, "Workspace saved."); };
  const saveProfile = (e: FormEvent) => { e.preventDefault(); go("profile", async () => { const r = await api.updateProfile({ name: displayName }); setUser(r.user); }, "Profile updated."); };
  const savePassword = (e: FormEvent) => { e.preventDefault(); go("pw", async () => { await api.changePassword({ currentPassword, newPassword }); setCurrentPassword(""); setNewPassword(""); }, "Password changed."); };

  const Status = ({ ok, label }: { ok: boolean; label: string }) => <span className={`badge ${ok ? "positive" : "quiet"}`}>{label} · {ok ? "Active" : "Unavailable"}</span>;

  return (
    <>
      <div className="page-head">
        <div><h1>Settings</h1><p>Your workspace, alert recipients and account.</p></div>
        {platform && <div className="actions"><Status ok={platform.aiConfigured} label="AI sentiment" /><Status ok={platform.searchConfigured} label="Search scanning" /><Status ok={platform.smtpConfigured} label="Email alerts" /></div>}
      </div>
      {msg && <div className={`banner ${msg.ok ? "ok" : "err"}`}>{msg.text}</div>}

      <div className="stack" style={{ gap: 14 }}>
        <form className="form-card" onSubmit={saveOrg}>
          <div className="between"><h3>Workspace</h3><a href="/app/billing" className="badge quiet">{organization?.plan === "trial" || !organization?.plan ? "Free trial" : organization.plan.replace(/^\w/, (c) => c.toUpperCase()) + " plan"} · Manage</a></div>
          <div className="form-row">
            <div className="field"><label>Company name</label><input value={orgName} onChange={(e) => setOrgName(e.target.value)} /></div>
            <div className="field"><label>Brand being monitored</label><input value={brandName} onChange={(e) => setBrandName(e.target.value)} /><span className="hint">Used for Google, Bing, YouTube and News scans and named in alert emails.</span></div>
          </div>
          <div className="field"><label>Alert recipients</label><input value={alertEmails} onChange={(e) => setAlertEmails(e.target.value)} placeholder="you@company.com, team@company.com" /><span className="hint">Comma-separated. Each negative mention is emailed once to everyone here.</span></div>
          <div className="between">
            <button type="button" className="btn secondary" disabled={busy !== null || !platform?.smtpConfigured} onClick={() => go("test", async () => { await api.testEmail(); }, "Test alert sent.")} title={platform?.smtpConfigured ? "" : "Email delivery is not configured on this platform yet"}>{busy === "test" ? <span className="spinner" /> : "Send test alert"}</button>
            <button type="submit" className="btn primary" disabled={busy !== null}>{busy === "org" ? <span className="spinner" /> : "Save workspace"}</button>
          </div>
        </form>

        <form className="form-card" onSubmit={saveProfile}>
          <h3>Profile</h3>
          <div className="form-row">
            <div className="field"><label>Name</label><input value={displayName} onChange={(e) => setDisplayName(e.target.value)} /></div>
            <div className="field"><label>Email</label><input value={user?.email ?? ""} disabled /><span className="hint">Your sign-in email can't be changed here yet.</span></div>
          </div>
          <div className="between"><span /><button type="submit" className="btn primary" disabled={busy !== null}>{busy === "profile" ? <span className="spinner" /> : "Save profile"}</button></div>
        </form>

        <form className="form-card" onSubmit={savePassword}>
          <h3>Password</h3>
          <div className="form-row">
            <div className="field"><label>Current password</label><input type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} /></div>
            <div className="field"><label>New password</label><input type="password" autoComplete="new-password" minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></div>
          </div>
          <div className="between"><span /><button type="submit" className="btn primary" disabled={busy !== null || !currentPassword || newPassword.length < 8}>{busy === "pw" ? <span className="spinner" /> : "Change password"}</button></div>
        </form>
      </div>
    </>
  );
}
