import { useEffect } from "react";
import { Link } from "react-router-dom";
import { APP_NAME, SOURCES } from "../brand";
import { Icons, SourceIcon } from "../components/ui";
import { MarketingNav, MarketingFooter } from "./MarketingNav";
import "./marketing.css";

function useReveal() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>(".reveal"));
    const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && e.target.classList.add("in")), { threshold: 0.1 });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

const LIVE = [
  { src: "reddit", who: "r/startups", t: "2m ago", q: "Support took four days to reply and the refund still hasn't landed…", s: "NEGATIVE" },
  { src: "trustpilot", who: "", t: "5m ago", q: "Fast, thorough, and they actually explained every step.", s: "POSITIVE" },
  { src: "google", who: "", t: "12m ago", q: "Great product and amazing customer support.", s: "POSITIVE" },
  { src: "linkedin", who: "", t: "18m ago", q: "Really happy with the new update, huge improvement.", s: "POSITIVE" },
  { src: "quora", who: "", t: "25m ago", q: `Does anyone know if ${APP_NAME} supports competitor tracking?`, s: "NEUTRAL" },
  { src: "youtube", who: "", t: "32m ago", q: "This tool saved us so much time.", s: "POSITIVE" },
];

const Logo = ({ name, glyph }: { name: string; glyph: React.ReactNode }) => (<span>{glyph}{name}</span>);

export function LandingPage() {
  useReveal();
  const bars = [6, 9, 7, 12, 10, 14, 11, 16, 13, 18, 15, 20, 17, 22];

  return (
    <div className="light">
      <MarketingNav />

      <header className="wrap hero">
        <div>
          <div className="eyebrow">Online reputation management</div>
          <h1>Know what the internet thinks about <em>your brand</em>.</h1>
          <p className="lede">
            Monitor every meaningful mention of your brand across Reddit, Quora, Trustpilot, LinkedIn, Google, YouTube and more —
            with real-time sentiment analysis and instant alerts.
          </p>
          <div className="actions">
            <Link to="/signup" className="btn primary lg">Start monitoring free <span style={{ width: 14, height: 14, display: "inline-flex" }}>{Icons.arrow}</span></Link>
            <a href="#how" className="btn secondary lg">See how it works</a>
          </div>
          <div className="fine">No credit card required · Set up in two minutes · Cancel anytime</div>
        </div>

        <div className="live reveal in">
          <div className="head">
            <span className="pulse"><i />Live mentions</span>
            <a href="#product">View all →</a>
          </div>
          {LIVE.map((m, i) => (
            <div className="item" key={i} style={{ animationDelay: `${i * 70}ms` }}>
              <SourceIcon platform={m.src} size={22} />
              <div>
                <div className="meta"><b>{SOURCES.find((s) => s.id === m.src)?.label}</b>{m.who && <span>{m.who}</span>}<span>·</span><span>{m.t}</span></div>
                <div className="q">"{m.q}"</div>
              </div>
              <span className={`badge ${m.s}`}>{m.s.charAt(0) + m.s.slice(1).toLowerCase()}</span>
            </div>
          ))}
          <div className="foot">
            <span><b>1,517</b> mentions this week <span style={{ color: "var(--positive)", marginLeft: 6 }}>↑ 12.8%</span></span>
            <span className="bars">{bars.map((h, i) => <i key={i} style={{ height: h }} />)}</span>
          </div>
        </div>
      </header>

      <section className="wrap trusted reveal">
        <div className="eyebrow">Trusted by modern brands</div>
        <div className="logos">
          <Logo name="stripe" glyph={<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13.5 9.2c0-.9.8-1.2 2-1.2 1.7 0 3.9.5 5.6 1.5V4.4C19.2 3.6 17.4 3.3 15.5 3.3c-4.5 0-7.5 2.4-7.5 6.3 0 6.2 8.5 5.2 8.5 7.9 0 1-.9 1.4-2.2 1.4-1.9 0-4.3-.8-6.2-1.8v5.2c2.1.9 4.2 1.3 6.2 1.3 4.6 0 7.8-2.3 7.8-6.3 0-6.7-8.6-5.5-8.6-8.1z" /></svg>} />
          <Logo name="Notion" glyph={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8 16V8l8 8V8" /></svg>} />
          <Logo name="Linear" glyph={<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10" opacity="0.15" /><path d="M3 13.5 10.5 21a9 9 0 0 1-7.5-7.5zM3.2 10.3 13.7 20.8a9 9 0 0 0 2.3-.6L3.8 8a9 9 0 0 0-.6 2.3zM4.5 6.3l13.2 13.2a9 9 0 0 0 1.5-1.2L5.7 4.8a9 9 0 0 0-1.2 1.5zM7 3.6l13.4 13.4A9 9 0 1 0 7 3.6z" /></svg>} />
          <Logo name="Vercel" glyph={<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l10 18H2z" /></svg>} />
          <Logo name="Figma" glyph={<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 3h4v6H8a3 3 0 1 1 0-6zM12 3h4a3 3 0 1 1 0 6h-4zM12 9h4a3 3 0 1 1-4 3V9zM8 9h4v6H8a3 3 0 1 1 0-6zM8 15h4v3a3 3 0 1 1-4-3z" /></svg>} />
          <Logo name="descript" glyph={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h12M4 12h16M4 18h8" /></svg>} />
        </div>
      </section>

      <section id="product" className="wrap section">
        <div className="sec-head reveal">
          <div className="eyebrow">Product</div>
          <h2>Everything a reputation team needs, in one place.</h2>
          <p>Stop checking eight sites by hand. {APP_NAME} brings every public conversation about your brand into a single, AI-scored feed.</p>
        </div>
        <div className="feature-grid">
          {[
            ["One unified feed", "Forum threads, reviews, answers, posts and search results — deduplicated and merged into one complete view of your brand's footprint.", Icons.mentions],
            ["Sentiment on every mention", "Each post and comment is classified positive, negative or neutral with a confidence score, so you see the mood, not just the volume.", Icons.overview],
            ["Instant negative alerts", "The moment a negative mention is detected, your team gets an email with the full text and a link. One alert per mention, never repeats.", Icons.alerts],
            ["Momentum, not snapshots", "Week-over-week trends on every metric show whether sentiment is improving or sliding before it becomes a problem.", Icons.up],
            ["Competitor benchmarking", "Track rival brands with the same engine and see how your reputation compares across the same sources.", Icons.sources],
            ["Reports clients open", "Monthly reputation reports with sentiment, sources and the conversations that mattered — exportable in one click.", Icons.reports],
          ].map(([t, d, ic], i) => (
            <div className={`feature reveal d${i % 3}`} key={String(t)}>
              <div className="ic">{ic as React.ReactNode}</div>
              <h3>{t as string}</h3>
              <p>{d as string}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="how" className="wrap section tight">
        <div className="sec-head reveal">
          <div className="eyebrow">How it works</div>
          <h2>Live in minutes. Working every hour.</h2>
        </div>
        <div className="steps">
          {[
            ["01", "Add your brand", "Create a workspace, name the brand you want to protect and choose the sources that matter."],
            ["02", "We scan continuously", "Our scanners run every hour, deduplicate as they go and score every new mention with AI."],
            ["03", "Act on what matters", "Negative mentions reach your inbox with a link to respond. Everything else waits in a dashboard that shows the trend at a glance."],
          ].map(([n, t, d], i) => (
            <div className={`step reveal d${i}`} key={n}><div className="n">{n}</div><h3>{t}</h3><p>{d}</p></div>
          ))}
        </div>
      </section>

      <section id="integrations" className="wrap section tight">
        <div className="sec-head reveal">
          <div className="eyebrow">Integrations</div>
          <h2>Every source your customers actually use.</h2>
        </div>
        <div className="integrations">
          {SOURCES.map((s, i) => (
            <div className={`integration reveal d${i % 3}`} key={s.id}><SourceIcon platform={s.id} size={28} />{s.label}</div>
          ))}
        </div>
      </section>

      <section className="wrap section tight">
        <div className="cta reveal">
          <div>
            <h2>Know what people say about you — before your customers do.</h2>
            <p>Set up takes two minutes. Your first scan runs immediately.</p>
          </div>
          <div className="row">
            <Link to="/pricing" className="btn secondary lg">See pricing</Link>
            <Link to="/signup" className="btn primary lg">Start monitoring free</Link>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
