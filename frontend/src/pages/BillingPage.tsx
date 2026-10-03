import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import type { BillingInterval, BillingPlan, BillingResponse, Entitlements } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { Icons, fmtDate } from "../components/ui";

function Meter({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  const tone = pct >= 100 ? "full" : pct >= 80 ? "warn" : "";
  return (
    <div className="meter">
      <div className="between"><span>{label}</span><span className="num muted">{used.toLocaleString()} / {limit.toLocaleString()}</span></div>
      <div className={`track ${tone}`}><i style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

function statusLine(e: Entitlements): { badge: string; cls: string; text: string } {
  switch (e.state) {
    case "trialing":
      return { badge: "Free trial", cls: "info", text: `${e.trialDaysLeft} day${e.trialDaysLeft === 1 ? "" : "s"} left · ends ${fmtDate(e.trialEndsAt)}. Everything in Growth is included while you try it.` };
    case "active":
      return e.cancelsAtPeriodEnd
        ? { badge: "Cancels soon", cls: "medium", text: `Your plan stays active until ${fmtDate(e.currentPeriodEnd)} and will not renew.` }
        : { badge: "Active", cls: "positive", text: e.currentPeriodEnd ? `Billed ${e.interval ?? "monthly"} · renews ${fmtDate(e.currentPeriodEnd)}.` : "Your plan is active." };
    case "past_due":
      return { badge: "Payment due", cls: "medium", text: "The last payment didn't go through. Update your billing details to avoid an interruption." };
    case "canceled":
      return { badge: "Ended", cls: "negative", text: "Your subscription has ended. Scanning and alerts are paused; your data is safe. Choose a plan to resume." };
    default:
      return e.plan === "trial"
        ? { badge: "Trial ended", cls: "negative", text: "Your free trial has ended. Scanning and alerts are paused; your data is safe. Choose a plan to resume." }
        : { badge: "Lapsed", cls: "negative", text: "Your subscription has lapsed. Choose a plan to resume scanning and alerts." };
  }
}

export function BillingPage() {
  const { refresh } = useAuth();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState<BillingResponse | null>(null);
  const [interval, setIntervalMode] = useState<BillingInterval>("monthly");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const res = await api.getBilling();
    setData(res);
    if (res.entitlements.interval) setIntervalMode(res.entitlements.interval);
    return res;
  }, []);

  useEffect(() => {
    load().catch((e) => setNotice({ ok: false, text: e?.message || "Could not load billing." }));
  }, [load]);

  // Returning from Stripe Checkout: the webhook lands a moment later, so re-check a few times.
  useEffect(() => {
    const result = params.get("checkout");
    if (!result) return;
    setParams({}, { replace: true });
    if (result === "cancelled") return setNotice({ ok: false, text: "Checkout was cancelled. You haven't been charged." });
    setNotice({ ok: true, text: "Payment received. Activating your plan…" });
    let tries = 0;
    const timer = window.setInterval(async () => {
      tries++;
      const res = await load().catch(() => null);
      if (res && res.entitlements.plan !== "trial" && res.entitlements.usable) {
        window.clearInterval(timer);
        setNotice({ ok: true, text: `You're on ${res.entitlements.planName}. Thank you!` });
        refresh();
      } else if (tries >= 10) window.clearInterval(timer);
    }, 2000);
    return () => window.clearInterval(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function choose(plan: BillingPlan) {
    setBusy(plan.id);
    setNotice(null);
    try {
      const res = await api.startCheckout(plan.id, interval);
      if (res.mode === "stripe" && res.url) window.location.href = res.url;
      else setNotice({ ok: true, text: res.message || "Request received." });
    } catch (e: any) {
      setNotice({ ok: false, text: e?.message || "Could not start checkout." });
    } finally {
      setBusy(null);
    }
  }

  async function portal() {
    setBusy("portal");
    try {
      const res = await api.openBillingPortal();
      window.location.href = res.url;
    } catch (e: any) {
      setNotice({ ok: false, text: e?.message || "Could not open billing." });
      setBusy(null);
    }
  }

  if (!data) {
    return (
      <>
        <div className="page-head"><div><h1>Billing</h1><p>Your plan, usage and limits.</p></div></div>
        {notice ? <div className={`banner ${notice.ok ? "ok" : "err"}`}>{notice.text}</div> : <div className="empty"><span className="spinner" /></div>}
      </>
    );
  }

  const e = data.entitlements;
  const st = statusLine(e);
  const onPaid = e.plan !== "trial" && e.usable;

  return (
    <>
      <div className="page-head">
        <div><h1>Billing</h1><p>Your plan, usage and limits.</p></div>
        {e.managedByStripe && (
          <div className="actions">
            <button type="button" className="btn secondary" onClick={portal} disabled={busy !== null}>{busy === "portal" ? <span className="spinner" /> : "Manage payment & invoices"}</button>
          </div>
        )}
      </div>
      {notice && <div className={`banner ${notice.ok ? "ok" : "err"}`}>{notice.text}</div>}

      <div className="grid-eq">
        <div className="card">
          <div className="card-head"><h3>Current plan</h3><span className={`badge ${st.cls}`}>{st.badge}</span></div>
          <div className="card-body">
            <div className="bill-plan">{e.planName}</div>
            <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.5, marginTop: 6 }}>{st.text}</p>
            <div className="bill-flags">
              <span className={e.limits.searchScanning ? "on" : ""}>{e.limits.searchScanning ? Icons.check : Icons.close}Google, YouTube &amp; News scanning</span>
              <span className={e.limits.exports ? "on" : ""}>{e.limits.exports ? Icons.check : Icons.close}Excel exports</span>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h3>Usage</h3><span className="faint" style={{ fontSize: 12 }}>Mentions reset on the 1st (UTC)</span></div>
          <div className="card-body stack" style={{ gap: 14 }}>
            <Meter label="Mentions this month" used={e.usage.mentionsThisMonth} limit={e.limits.mentionsPerMonth} />
            <Meter label="Keywords" used={e.usage.keywords} limit={e.limits.keywords} />
            <Meter label="Competitors" used={e.usage.competitors} limit={e.limits.competitors} />
            <Meter label="Alert recipients" used={e.usage.alertRecipients} limit={e.limits.alertRecipients} />
          </div>
        </div>
      </div>

      <div className="between" style={{ margin: "22px 0 12px" }}>
        <h2 style={{ fontSize: 16 }}>{onPaid ? "Change plan" : "Choose a plan"}</h2>
        <div className="seg">
          <button type="button" className={interval === "monthly" ? "on" : ""} onClick={() => setIntervalMode("monthly")}>Monthly</button>
          <button type="button" className={interval === "yearly" ? "on" : ""} onClick={() => setIntervalMode("yearly")}>Yearly <em>Save 20%</em></button>
        </div>
      </div>

      <div className="bill-grid">
        {data.plans.map((p) => {
          const current = onPaid && e.plan === p.id && (e.interval ?? "monthly") === interval;
          const price = interval === "yearly" ? p.priceYearly : p.priceMonthly;
          return (
            <div className={`bill-col${p.id === "growth" ? " featured" : ""}`} key={p.id}>
              <div className="between"><b>{p.name}</b>{p.id === "growth" && <span className="badge quiet">Most popular</span>}</div>
              <div className="muted" style={{ fontSize: 12.5 }}>{p.description}</div>
              <div className="price"><b className="num">${price}</b><span>/ month{interval === "yearly" ? `, billed $${price * 12} yearly` : ""}</span></div>
              <ul>
                <li>{Icons.check}{p.limits.mentionsPerMonth.toLocaleString()} mentions / month</li>
                <li>{Icons.check}{p.limits.keywords} keywords · {p.limits.competitors} competitors</li>
                <li>{Icons.check}{p.limits.alertRecipients} alert recipients</li>
                <li className={p.limits.searchScanning ? "" : "off"}>{p.limits.searchScanning ? Icons.check : Icons.close}{p.limits.searchScanning ? "All sources incl. Google, YouTube & News" : "5 direct sources (no search scanning)"}</li>
                <li className={p.limits.exports ? "" : "off"}>{p.limits.exports ? Icons.check : Icons.close}Excel exports</li>
              </ul>
              <button type="button" className={`btn ${p.id === "growth" ? "primary" : "secondary"}`} disabled={current || busy !== null} onClick={() => choose(p)}>
                {busy === p.id ? <span className="spinner" /> : current ? "Current plan" : onPaid ? `Switch to ${p.name}` : `Choose ${p.name}`}
              </button>
            </div>
          );
        })}
      </div>
      <p className="faint" style={{ fontSize: 12.5, marginTop: 12 }}>
        {data.checkout === "stripe"
          ? "Payments are processed securely by Stripe. Cancel any time; your plan stays active until the end of the paid period."
          : "Choosing a plan sends us your request; we'll email payment details and activate it as soon as it's settled. Your trial keeps running in the meantime."}
      </p>
    </>
  );
}
