import { useEffect } from "react";
import { Link } from "react-router-dom";
import { APP_NAME, SUPPORT_EMAIL } from "../brand";
import { useAuth } from "../auth/AuthContext";
import "./marketing.css";

function useReveal() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>(".reveal"));
    if (!("IntersectionObserver" in window)) {
      els.forEach((el) => el.classList.add("in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && e.target.classList.add("in")),
      { threshold: 0.12 }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

export function LandingPage() {
  useReveal();
  const { user } = useAuth();

  return (
    <div className="mk">
      <nav className="mk-nav">
        <div className="wordmark" style={{ padding: 0, margin: 0, border: "none" }}>
          <span className="mark">{APP_NAME[0]}</span>
          <span className="name">{APP_NAME}</span>
        </div>
        <div className="links">
          <a href="#features">Features</a>
          <a href="#how">How it works</a>
          <a href="#pricing">Pricing</a>
        </div>
        <div className="cta">
          {user ? (
            <Link to="/app" className="btn-primary">Open dashboard →</Link>
          ) : (
            <>
              <Link to="/login" className="btn-ghost">Sign in</Link>
              <Link to="/signup" className="btn-primary">Start free</Link>
            </>
          )}
        </div>
      </nav>

      <header className="hero mk-container">
        <div className="eyebrow reveal in">Online Reputation Management</div>
        <h1 className="reveal in">
          The only platform you need for <em>online reputation</em> management.
        </h1>
        <p className="lede reveal in d1">
          Every mention of your brand across Reddit, Quora, Trustpilot, LinkedIn, TeamBlind and Google — found every hour,
          scored by AI, and the negative ones in your inbox before they spread.
        </p>
        <div className="actions reveal in d2">
          <Link to="/signup" className="btn-primary">Start monitoring free →</Link>
          <a href="#how" className="btn-ghost">See how it works</a>
        </div>
        <div className="fine reveal in d3">No credit card · Set up in two minutes · Cancel anytime</div>

        <div className="hero-visual reveal d2">
          <div className="hv-grid">
            <div className="hv-stat"><div className="l">Total mentions</div><div className="v">1,517</div><div className="t" style={{ color: "var(--positive)" }}>▲ 12.8% vs prev 7d</div></div>
            <div className="hv-stat"><div className="l">Positive</div><div className="v" style={{ color: "var(--positive)" }}>477</div><div className="t" style={{ color: "var(--positive)" }}>▲ 32.3%</div></div>
            <div className="hv-stat"><div className="l">Negative</div><div className="v" style={{ color: "var(--negative)" }}>61</div><div className="t" style={{ color: "var(--positive)" }}>▼ 32.7%</div></div>
            <div className="hv-stat"><div className="l">Alerts sent</div><div className="v">9</div><div className="t" style={{ color: "var(--text-dim)" }}>last 24 hours</div></div>
          </div>
          <div className="hv-feed">
            <div className="hv-item">
              <div className="m"><span className="badge NEGATIVE">NEGATIVE</span> Reddit · r/startups · 2h ago</div>
              "Support took four days to reply and the refund still hasn't landed…"
            </div>
            <div className="hv-item">
              <div className="m"><span className="badge POSITIVE">POSITIVE</span> Trustpilot · ★★★★★ · 5h ago</div>
              "Fast, thorough, and they actually explained every step. Would recommend."
            </div>
          </div>
        </div>

        <div className="logos reveal">
          <span>Reddit</span><span>Quora</span><span>Trustpilot</span><span>LinkedIn</span><span>TeamBlind</span><span>Google</span><span>YouTube</span><span>News</span>
        </div>
      </header>

      <section id="features" className="section mk-container">
        <div className="section-head reveal">
          <h2>Everything a reputation team needs, in one place</h2>
          <p>Stop searching eight sites by hand. {APP_NAME} brings every public conversation about your brand into a single, AI-scored feed.</p>
        </div>
        <div className="features">
          <div className="feature reveal"><div className="ic">◎</div><h3>One unified feed</h3><p>Forum threads, reviews, answers, posts and search results — deduplicated and merged into one complete count of your brand's footprint.</p></div>
          <div className="feature reveal d1"><div className="ic">✦</div><h3>AI sentiment on every mention</h3><p>Each post and comment is classified positive, negative or neutral with a confidence score, so you see the mood, not just the volume.</p></div>
          <div className="feature reveal d2"><div className="ic">!</div><h3>Negative-mention alerts</h3><p>The moment a negative mention is found, your team gets an email with the full text and a direct link. One alert per mention, never repeats.</p></div>
          <div className="feature reveal"><div className="ic">↗</div><h3>Momentum, not snapshots</h3><p>Week-over-week trend arrows on every metric show whether sentiment is improving or sliding before it becomes a problem.</p></div>
          <div className="feature reveal d1"><div className="ic">⚔</div><h3>Competitor benchmarking</h3><p>Track rival brands with the same engine and see how your reputation compares across the same platforms.</p></div>
          <div className="feature reveal d2"><div className="ic">▤</div><h3>Reports your clients will open</h3><p>Multi-tab Excel exports with platform breakdowns, sentiment and clickable source links — ready to forward.</p></div>
        </div>
      </section>

      <section id="how" className="section mk-container" style={{ paddingTop: 0 }}>
        <div className="section-head reveal">
          <h2>Live in minutes, working every hour</h2>
          <p>There is nothing to install and nothing to integrate.</p>
        </div>
        <div className="steps">
          <div className="step reveal"><div className="num">01</div><h3>Add your brand</h3><p>Create your workspace, name the brand you want to protect, and pick the platforms that matter to you.</p></div>
          <div className="step reveal d1"><div className="num">02</div><h3>We scan every hour</h3><p>Our scrapers and search scanners run automatically around the clock, deduplicating as they go and scoring every new mention with AI.</p></div>
          <div className="step reveal d2"><div className="num">03</div><h3>Act on what matters</h3><p>Negative mentions land in your inbox with a link to respond. Everything else waits in a dashboard that shows the trend at a glance.</p></div>
        </div>
      </section>

      <section id="pricing" className="section mk-container" style={{ paddingTop: 0 }}>
        <div className="section-head reveal">
          <h2>Early-access pricing</h2>
          <p>We're onboarding brands one at a time while we scale. Early members keep their price.</p>
        </div>
        <div className="pricing">
          <div className="plan featured reveal">
            <div className="pn">Early access</div>
            <div className="pp">Free <small>during early access</small></div>
            <ul>
              <li>One brand workspace</li>
              <li>Reddit, Quora, Trustpilot, LinkedIn, TeamBlind &amp; Google</li>
              <li>Hourly scans with AI sentiment</li>
              <li>Negative-mention email alerts</li>
              <li>Competitor tracking</li>
              <li>Excel reports</li>
            </ul>
            <div className="spacer" />
            <Link to="/signup" className="btn-primary" style={{ justifyContent: "center" }}>Create your workspace</Link>
          </div>
          <div className="plan reveal d1">
            <div className="pn">Agencies &amp; enterprise</div>
            <div className="pp">Custom</div>
            <ul>
              <li>Multiple brands and workspaces</li>
              <li>White-label reports</li>
              <li>Priority scanning cadence</li>
              <li>Dedicated onboarding</li>
            </ul>
            <div className="spacer" />
            <a href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`${APP_NAME} for our agency`)}`} className="btn-ghost" style={{ justifyContent: "center" }}>Talk to us</a>
          </div>
        </div>
      </section>

      <section className="mk-container" style={{ paddingBottom: 90 }}>
        <div className="cta-band reveal">
          <h2>Know what people say about you — before your customers do.</h2>
          <p>Set up takes two minutes. Your first scan runs immediately.</p>
          <Link to="/signup" className="btn-primary">Start monitoring free →</Link>
        </div>
      </section>

      <footer className="mk-footer">
        <div className="mk-container inner">
          <div>© {new Date().getFullYear()} {APP_NAME}. All rights reserved.</div>
          <div style={{ display: "flex", gap: 20 }}>
            <a href="#features">Features</a>
            <a href="#pricing">Pricing</a>
            <a href={`mailto:${SUPPORT_EMAIL}`}>Contact</a>
            <Link to="/login">Sign in</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
