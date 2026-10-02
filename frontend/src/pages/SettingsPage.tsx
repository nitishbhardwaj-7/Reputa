import { useEffect, useState, type FormEvent } from "react";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import type { PlatformStatus } from "../api/types";

type Msg = { type: "success" | "error"; text: string } | null;

export function SettingsPage() {
  const { user, organization, setOrganization, setUser } = useAuth();

  const [orgName, setOrgName] = useState(organization?.name ?? "");
  const [brandName, setBrandName] = useState(organization?.brandName ?? "");
  const [alertEmails, setAlertEmails] = useState((organization?.alertEmails ?? []).join(", "));
  const [platform, setPlatform] = useState<PlatformStatus | null>(null);

  const [displayName, setDisplayName] = useState(user?.name ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const [savingOrg, setSavingOrg] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [testing, setTesting] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  useEffect(() => {
    api.getSettings().then((res) => {
      setOrgName(res.organization.name);
      setBrandName(res.organization.brandName);
      setAlertEmails(res.organization.alertEmails.join(", "));
      setPlatform(res.platform);
      setOrganization(res.organization);
    }).catch(() => {});
  }, [setOrganization]);

  function flash(type: "success" | "error", text: string) {
    setMsg({ type, text });
    window.setTimeout(() => setMsg(null), 5000);
  }

  async function saveOrg(e: FormEvent) {
    e.preventDefault();
    setSavingOrg(true);
    try {
      const emails = alertEmails.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
      const res = await api.updateSettings({ name: orgName, brandName, alertEmails: emails });
      setOrganization(res.organization);
      setAlertEmails(res.organization.alertEmails.join(", "));
      flash("success", "Workspace settings saved.");
    } catch (err: any) {
      flash("error", err?.message || "Could not save settings.");
    } finally {
      setSavingOrg(false);
    }
  }

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const res = await api.updateProfile({ name: displayName });
      setUser(res.user);
      flash("success", "Profile updated.");
    } catch (err: any) {
      flash("error", err?.message || "Could not update profile.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function savePassword(e: FormEvent) {
    e.preventDefault();
    setSavingPassword(true);
    try {
      await api.changePassword({ currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      flash("success", "Password changed.");
    } catch (err: any) {
      flash("error", err?.message || "Could not change password.");
    } finally {
      setSavingPassword(false);
    }
  }

  async function sendTest() {
    setTesting(true);
    try {
      const res = await api.testEmail();
      flash("success", res.message);
    } catch (err: any) {
      flash("error", err?.message || "Test email failed.");
    } finally {
      setTesting(false);
    }
  }

  const Status = ({ ok, label }: { ok: boolean; label: string }) => (
    <span className={`badge ${ok ? "POSITIVE" : "NEUTRAL"}`}>{label}: {ok ? "Active" : "Unavailable"}</span>
  );

  return (
    <div style={{ maxWidth: 820 }}>
      <div className="page-header">
        <div>
          <h2>Settings</h2>
          <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>Your workspace, alert recipients and account.</p>
        </div>
        {platform && (
          <div className="row">
            <Status ok={platform.aiConfigured} label="AI sentiment" />
            <Status ok={platform.searchConfigured} label="Search scanning" />
            <Status ok={platform.smtpConfigured} label="Email alerts" />
          </div>
        )}
      </div>

      {msg && <div className={`banner ${msg.type === "success" ? "success" : "error"}`}>{msg.text}</div>}

      <form className="card" onSubmit={saveOrg} style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 18 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>Workspace</h3>
        <div className="settings-form-group">
          <label htmlFor="orgName">Company name</label>
          <input id="orgName" type="text" value={orgName} onChange={(e) => setOrgName(e.target.value)} />
        </div>
        <div className="settings-form-group">
          <label htmlFor="brandName">Brand being monitored</label>
          <input id="brandName" type="text" value={brandName} onChange={(e) => setBrandName(e.target.value)} />
          <span className="field-hint">Used as the search query for Google, Bing, YouTube and News scans, and named in alert emails.</span>
        </div>
        <div className="settings-form-group">
          <label htmlFor="alertEmails">Alert recipients</label>
          <input id="alertEmails" type="text" value={alertEmails} onChange={(e) => setAlertEmails(e.target.value)} placeholder="you@company.com, team@company.com" />
          <span className="field-hint">Comma-separated. Each negative mention is emailed once to everyone here.</span>
        </div>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <button type="button" className="secondary" onClick={sendTest} disabled={testing || !platform?.smtpConfigured} title={platform?.smtpConfigured ? "" : "Email delivery is not configured on this platform yet"}>
            {testing ? <span className="spinner" /> : "Send test alert"}
          </button>
          <button type="submit" disabled={savingOrg}>{savingOrg ? <span className="spinner" /> : "Save workspace"}</button>
        </div>
      </form>

      <form className="card" onSubmit={saveProfile} style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 18 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>Profile</h3>
        <div className="settings-form-group">
          <label htmlFor="displayName">Name</label>
          <input id="displayName" type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </div>
        <div className="settings-form-group">
          <label>Email</label>
          <input type="email" value={user?.email ?? ""} disabled />
          <span className="field-hint">Your sign-in email can't be changed here yet.</span>
        </div>
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button type="submit" disabled={savingProfile}>{savingProfile ? <span className="spinner" /> : "Save profile"}</button>
        </div>
      </form>

      <form className="card" onSubmit={savePassword} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>Password</h3>
        <div className="settings-form-group">
          <label htmlFor="currentPassword">Current password</label>
          <input id="currentPassword" type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
        </div>
        <div className="settings-form-group">
          <label htmlFor="newPassword">New password</label>
          <input id="newPassword" type="password" autoComplete="new-password" minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        </div>
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button type="submit" disabled={savingPassword || !currentPassword || newPassword.length < 8}>
            {savingPassword ? <span className="spinner" /> : "Change password"}
          </button>
        </div>
      </form>
    </div>
  );
}
