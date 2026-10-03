import { useLayoutEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { APP_NAME } from "../brand";
import { Donut, Icons, SourceIcon } from "../components/ui";
import { gsap, ScrollTrigger, countUpAll, drawAll, reducedMotion, revealLinesAll, useSmoothScroll } from "../lib/motion";
import { AlertMock, DashboardMock, ReportMock, Scaled, Spark } from "../marketing/mocks";
import { Arrow, Lines } from "../marketing/Lines";
import { PricingSection } from "../marketing/Pricing";
import { MarketingNav, MarketingFooter } from "./MarketingNav";
import "./marketing.css";

/* ------------------------------------------------------------------ data */
const LIVE = [
  { src: "reddit", who: "r/startups", t: "2m ago", q: "Support took four days to reply and the refund still hasn't landed…", s: "NEGATIVE" },
  { src: "trustpilot", who: "", t: "5m ago", q: "Fast, thorough, and they actually explained every step.", s: "POSITIVE" },
  { src: "google", who: "", t: "12m ago", q: "Great product and amazing customer support.", s: "POSITIVE" },
  { src: "linkedin", who: "", t: "18m ago", q: "Really happy with the new update.", s: "POSITIVE" },
];

const MATRIX: { id: string; label: string; n: number; glyph?: React.ReactNode }[] = [
  { id: "reddit", label: "Reddit", n: 342 }, { id: "google", label: "Google", n: 218 }, { id: "trustpilot", label: "Trustpilot", n: 196 }, { id: "linkedin", label: "LinkedIn", n: 148 },
  { id: "quora", label: "Quora", n: 121 }, { id: "youtube", label: "YouTube", n: 97 }, { id: "teamblind", label: "TeamBlind", n: 73 },
  { id: "news", label: "News", n: 51, glyph: <span className="src-icon" style={{ width: 30, height: 30, background: "#111111", fontSize: 14 }}>N</span> },
];

const LOGOS = [
  ["stripe", <svg key="s" viewBox="0 0 24 24" fill="currentColor"><path d="M13.5 9.2c0-.9.8-1.2 2-1.2 1.7 0 3.9.5 5.6 1.5V4.4C19.2 3.6 17.4 3.3 15.5 3.3c-4.5 0-7.5 2.4-7.5 6.3 0 6.2 8.5 5.2 8.5 7.9 0 1-.9 1.4-2.2 1.4-1.9 0-4.3-.8-6.2-1.8v5.2c2.1.9 4.2 1.3 6.2 1.3 4.6 0 7.8-2.3 7.8-6.3 0-6.7-8.6-5.5-8.6-8.1z" /></svg>],
  ["Notion", <svg key="n" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8 16V8l8 8V8" /></svg>],
  ["Linear", <svg key="l" viewBox="0 0 24 24" fill="currentColor"><path d="M3 13.5 10.5 21a9 9 0 0 1-7.5-7.5zM3.2 10.3 13.7 20.8a9 9 0 0 0 2.3-.6L3.8 8a9 9 0 0 0-.6 2.3zM4.5 6.3l13.2 13.2a9 9 0 0 0 1.5-1.2L5.7 4.8a9 9 0 0 0-1.2 1.5zM7 3.6l13.4 13.4A9 9 0 1 0 7 3.6z" /></svg>],
  ["Vercel", <svg key="v" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l10 18H2z" /></svg>],
  ["Figma", <svg key="f" viewBox="0 0 24 24" fill="currentColor"><path d="M8 3h4v6H8a3 3 0 1 1 0-6zM12 3h4a3 3 0 1 1 0 6h-4zM12 9h4a3 3 0 1 1-4 3V9zM8 9h4v6H8a3 3 0 1 1 0-6zM8 15h4v3a3 3 0 1 1-4-3z" /></svg>],
  ["descript", <svg key="d" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h12M4 12h16M4 18h8" /></svg>],
] as const;

const QUOTES = [
  ["We used to find out about a bad thread when a customer forwarded it. Now the alert lands before the thread has ten upvotes.", "Priya", "Head of Brand, fintech scale-up"],
  ["The weekly report replaced a spreadsheet three people maintained by hand. The sentiment trend alone justified the price.", "Marcus", "Director of Communications, B2B SaaS"],
  ["Competitor tracking is the quiet killer feature. We watched a rival's refund complaints spike and adjusted our messaging the same week.", "Elena", "VP Marketing, consumer app"],
];

/* ------------------------------------------------------------------ hero background */
function HeroLines() {
  const rows = Array.from({ length: 9 }, (_, i) => 60 + i * 70);
  return (
    <svg className="hero-lines" viewBox="0 0 1200 760" preserveAspectRatio="none" aria-hidden>
      {rows.map((y) => <line key={y} x1="0" y1={y} x2="1200" y2={y} />)}
      {[180, 420, 660, 900].map((x) => <line key={x} x1={x} y1="0" x2={x} y2="760" />)}
      <path className="wave" pathLength={1} d="M0 520 C 120 500, 160 420, 260 440 S 420 560, 540 500 S 700 330, 820 380 S 980 520, 1100 440 L 1200 400" />
      <path className="wave" pathLength={1} style={{ opacity: 0.5 }} d="M0 600 C 150 580, 200 660, 320 640 S 520 540, 640 600 S 860 700, 980 620 L 1200 580" />
    </svg>
  );
}

/* ------------------------------------------------------------------ page */
export function LandingPage() {
  useSmoothScroll();
  const root = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = root.current;
    if (!el || reducedMotion()) return;
    const ctx = gsap.context(() => {
      /* nav border on scroll */
      /* hero entrance */
      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
      tl.from(".mk-nav", { y: -18, opacity: 0, duration: 0.9, ease: "power4.out" })
        .from(".hero-lines .wave", { strokeDashoffset: 1, duration: 1.4, ease: "power2.inOut", stagger: 0.15 }, 0)
        .from(".hero .eyebrow", { clipPath: "inset(0 100% 0 0)", duration: 0.7 }, "-=0.35")
        .from(".hero .ln-in", { yPercent: 112, duration: 1, ease: "power4.out", stagger: { each: 0.09 } }, "-=0.45")
        .from(".hero .lede, .hero .actions, .hero .fine", { y: 18, opacity: 0, duration: 0.7, stagger: 0.08 }, "-=0.6")
        .from(".hero-visual", { y: 100, scale: 0.94, opacity: 0, duration: 1.4, ease: "power4.out" }, "-=0.95")
        .add(() => drawAll(el.querySelector(".hero-visual")!), "-=1.1");

      /* dashboard keeps drifting as the page starts to move */
      gsap.to(".hero-visual .frame", { y: -40, rotate: 0, ease: "none", scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true } });

      /* Pinned story first: anything created after it gets the pin spacer folded into its positions. */
      const mm = gsap.matchMedia();
      mm.add("(min-width: 900px)", () => {
        /* pinned live-mentions story */
        const cards = gsap.utils.toArray<HTMLElement>(".mon .mcard");
        const st = gsap.timeline({ scrollTrigger: { trigger: ".mon", start: "top top", end: "+=200%", pin: true, scrub: 0.6, anticipatePin: 1 } });
        cards.forEach((c, i) => {
          st.fromTo(c, { y: 90, scale: 0.94, opacity: 0, rotateX: 8, clipPath: "inset(0 0 100% 0)" },
            { y: 0, scale: 1, opacity: 1, rotateX: 0, clipPath: "inset(0 0 0% 0)", duration: 1 }, i);
          if (i > 0) st.to(cards.slice(0, i), { y: "-=12", scale: "-=0.015", opacity: "-=0.18", duration: 1 }, "<");
        });
        st.fromTo(".mon .rail i", { scaleY: 0 }, { scaleY: 1, duration: cards.length, ease: "none" }, 0);
        st.from(".mon .detected", { opacity: 0, y: 8, duration: 0.5 }, cards.length - 0.3);
        st.from(".mon .copy .caps li", { x: -10, opacity: 0, stagger: 0.25, duration: 0.8 }, 0.2);

        /* parallax data objects */
        [[".obj-1", -24], [".obj-2", -48], [".obj-3", -12], [".obj-4", -36]].forEach(([sel, y]) =>
          gsap.to(sel as string, { y, ease: "none", scrollTrigger: { trigger: ".ins", start: "top bottom", end: "bottom top", scrub: true } }));

        /* alert windows stack toward the viewer */
        const at = gsap.timeline({ scrollTrigger: { trigger: ".al", start: "top 75%", end: "center 45%", scrub: 0.5 } });
        at.fromTo(".al .w3", { y: -70, scale: 0.86, opacity: 0 }, { y: -56, scale: 0.9, opacity: 0.45 })
          .fromTo(".al .w2", { y: -40, scale: 0.9, opacity: 0 }, { y: -28, scale: 0.95, opacity: 0.75 }, "-=0.3")
          .fromTo(".al .w1", { y: 40, scale: 0.96, opacity: 0 }, { y: 0, scale: 1, opacity: 1 }, "-=0.3");

        /* report frame settles in */
        gsap.from(".rep .frame", { y: 60, scale: 0.97, ease: "none", scrollTrigger: { trigger: ".rep .frame", start: "top bottom", end: "top 40%", scrub: true } });
      });
      mm.add("(max-width: 899px)", () => {
        gsap.from(".mon .mcard", { y: 30, opacity: 0, stagger: 0.12, duration: 0.7, scrollTrigger: { trigger: ".mon .feed", start: "top 85%", once: true } });
        gsap.from(".al .w1", { y: 30, opacity: 0, duration: 0.7, scrollTrigger: { trigger: ".al .stage", start: "top 85%", once: true } });
      });


      const nav = el.querySelector(".mk-nav-wrap")!;
      ScrollTrigger.create({ start: 20, onUpdate: (s) => nav.classList.toggle("scrolled", s.scroll() > 20) });
      /* the page itself fades to black around each dark section instead of a hard edge */
      gsap.set(".mon, .al", { backgroundColor: "transparent" });
      // Fade in on the dark section itself; fade out on the light section that follows it,
      // because a pinned section's "bottom" is measured before pinning and would fire too early.
      // The glass nav follows the same colour: it inverts once the page behind it is more dark than light.
      const syncNav = () => {
        const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(el.style.backgroundColor);
        if (m) nav.classList.toggle("on-dark", (Number(m[1]) + Number(m[2]) + Number(m[3])) / 3 < 128);
      };
      ([[".mon", ".ins"], [".al", ".rep"]] as const).forEach(([dark, next]) => {
        gsap.fromTo(el, { backgroundColor: "#f7f6f2" }, { backgroundColor: "#0b0c0d", ease: "none", immediateRender: false, onUpdate: syncNav,
          scrollTrigger: { trigger: dark, start: "top 85%", end: "top 30%", scrub: true } });
        gsap.fromTo(el, { backgroundColor: "#0b0c0d" }, { backgroundColor: "#f7f6f2", ease: "none", immediateRender: false, onUpdate: syncNav,
          scrollTrigger: { trigger: next, start: "top 70%", end: "top 20%", scrub: true } });
      });

      revealLinesAll(el);
      countUpAll(el);

      /* source cells, testimonials, pricing columns stagger in */
      gsap.from(".cell", { opacity: 0, y: 10, stagger: { each: 0.04, grid: "auto", from: "start" }, duration: 0.6, scrollTrigger: { trigger: ".matrix", start: "top 80%", once: true } });
      gsap.from(".tm .quote", { opacity: 0, y: 14, stagger: 0.1, duration: 0.7, scrollTrigger: { trigger: ".tm .grid3", start: "top 85%", once: true } });
      gsap.from(".plan", { opacity: 0, y: 14, stagger: 0.1, duration: 0.7, scrollTrigger: { trigger: ".pr-grid", start: "top 85%", once: true } });
      gsap.from(".obj", { opacity: 0, y: 24, stagger: 0.12, duration: 0.8, scrollTrigger: { trigger: ".ins .objs", start: "top 80%", once: true } });
      drawAll(el.querySelector(".ins")!);
      gsap.from(".obj .grow-x", { scaleX: 0, duration: 0.9, ease: "power3.out", stagger: 0.06, scrollTrigger: { trigger: ".obj-4", start: "top 85%", once: true } });
      drawAll(el.querySelector(".rep")!);
    }, root);
    return () => ctx.revert();
  }, []);

  return (
    <div className="light with-nav" ref={root}>
      <MarketingNav />

      {/* ------------------------------------------------ hero */}
      <header className="wrap hero">
        <HeroLines />
        <div className="copy">
          <div className="eyebrow">Online reputation management</div>
          <Lines as="h1" className="h-xl" lines={["Know what the internet", "is saying about", <span className="dim">your brand.</span>]} />
          <p className="lede">
            Monitor every meaningful mention of your brand across Reddit, Quora, Trustpilot, LinkedIn, Google, YouTube and more —
            with hourly updates, AI sentiment analysis and instant alerts for negative conversations.
          </p>
          <div className="actions">
            <Link to="/signup" className="btn primary lg">Start monitoring free <Arrow /></Link>
            <a href="#how" className="btn secondary lg">See how it works</a>
          </div>
          <div className="fine">14-day free trial · No credit card required · Cancel anytime</div>
        </div>
        <div className="hero-visual">
          <div className="scroller">
            <div className="frame"><Scaled width={1120}><DashboardMock /></Scaled></div>
          </div>
        </div>
      </header>

      {/* ------------------------------------------------ trust */}
      <section className="trusted">
        <div className="wrap"><div className="eyebrow">Trusted by modern brands</div></div>
        <div className="marquee">
          <div className="track">
            {[...LOGOS, ...LOGOS].map(([name, glyph], i) => <span key={i}>{glyph}{name}</span>)}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ real-time monitoring (pinned) */}
      <section id="how" className="dark mon">
        <div className="wrap pin">
          <div className="copy">
            <div className="eyebrow">Real-time monitoring</div>
            <Lines data-lines className="h-lg" lines={["Every mention.", "As it happens."]} />
            <p className="lede" style={{ marginTop: 22 }}>We track conversations across the web in real time, so you never miss what people are saying about your brand.</p>
            <ul className="caps">
              <li><i>{Icons.sources}</i>Monitor 10+ sources</li>
              <li><i>{Icons.refresh}</i>Hourly updates</li>
              <li><i>{Icons.overview}</i>AI sentiment analysis</li>
              <li><i>{Icons.bell}</i>Instant negative alerts</li>
            </ul>
            <a href="#integrations" className="link" style={{ marginTop: 28 }}>Explore all integrations <Arrow /></a>
          </div>
          <div className="feed">
            <div className="rail"><i /></div>
            {LIVE.map((m) => (
              <div className="mcard" key={m.q}>
                <SourceIcon platform={m.src} size={26} />
                <div>
                  <div className="meta"><b>{m.src === "reddit" ? "Reddit" : m.src === "trustpilot" ? "Trustpilot" : m.src === "google" ? "Google" : "LinkedIn"}</b>{m.who && <span>{m.who}</span>}<span>·</span><span>{m.t}</span></div>
                  <div className="q">"{m.q}"</div>
                </div>
                <span className={`badge ${m.s}`}>{m.s[0] + m.s.slice(1).toLowerCase()}</span>
              </div>
            ))}
            <div className="detected"><i />61 negative mentions detected</div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ signal from noise */}
      <section id="product" className="wrap sec ins">
        <div className="grid12">
          <div className="copy">
            <div className="eyebrow" style={{ marginBottom: 18 }}>From noise to insight</div>
            <Lines data-lines className="h-xl" lines={["Turn conversations", "into opportunities."]} />
            <p className="lede" style={{ marginTop: 26 }}>Understand sentiment, spot trends, and take action before small issues become big problems.</p>
            <Link to="/signup" className="link" style={{ marginTop: 26 }}>See all features <Arrow /></Link>
          </div>
          <div className="objs">
            <div className="obj obj-1">
              <div className="l">Positive mentions</div>
              <div className="v pos" data-count="477">477</div>
              <div className="t pos">↑ 32.3% vs. last week</div>
              <div className="spark"><Spark values={[20, 24, 22, 30, 28, 36, 40, 38, 46, 52, 50, 58]} color="#15966a" w={260} h={56} /></div>
            </div>
            <div className="obj obj-2">
              <div className="l">Negative mentions</div>
              <div className="v neg" data-count="61">61</div>
              <div className="t neg">↓ 32.7% vs. last week</div>
              <div className="spark"><Spark values={[14, 16, 12, 15, 11, 10, 12, 9, 8, 7, 8, 6]} color="#e5484d" w={260} h={56} /></div>
            </div>
            <div className="obj obj-3">
              <div className="l">Sentiment distribution</div>
              <div className="donut">
                <Donut slices={[{ label: "Positive", value: 2416, color: "#15966a" }, { label: "Neutral", value: 981, color: "#8a8f98" }, { label: "Negative", value: 445, color: "#e5484d" }]} total={3842} label="Mentions" size={96} />
                <ul><li><i style={{ background: "#15966a" }} />Positive<em>62.9%</em></li><li><i style={{ background: "#8a8f98" }} />Neutral<em>25.5%</em></li><li><i style={{ background: "#e5484d" }} />Negative<em>11.6%</em></li></ul>
              </div>
            </div>
            <div className="obj obj-4">
              <div className="l">Top topics</div>
              <div className="topics">
                {[["Customer support", 28], ["Pricing", 16], ["Integrations", 14], ["Product feedback", 12], ["Refunds", 8]].map(([t, n]) => (
                  <div className="topic" key={t as string}><span>{t}</span><span className="bar"><i className="grow-x" style={{ width: `${(Number(n) / 28) * 100}%` }} /></span><em>{n}%</em></div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ sources */}
      <section id="integrations" className="wrap sec srcs">
        <div className="grid12">
          <div className="copy">
            <div className="eyebrow" style={{ marginBottom: 18 }}>Multi-source monitoring</div>
            <Lines data-lines className="h-lg" lines={["One platform.", "Everywhere your", "brand is mentioned."]} />
            <p className="lede" style={{ marginTop: 22 }}>Track mentions across Reddit, Quora, Trustpilot, LinkedIn, Google, YouTube, TeamBlind and more. Nothing to connect — we read the public web.</p>
            <Link to="/signup" className="link" style={{ marginTop: 26 }}>View all sources <Arrow /></Link>
          </div>
          <div className="matrix">
            {MATRIX.map((m, i) => (
              <div className="cell" key={m.id}>
                <span className="idx">{String(i + 1).padStart(2, "0")}</span>
                <span className="glyph">{m.glyph ?? <SourceIcon platform={m.id} size={30} />}</span>
                <div className="meta"><b>{m.label}</b><small>{m.n} mentions this week</small></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ alerts */}
      <section className="dark sec al">
        <div className="wrap grid12">
          <div className="copy">
            <div className="eyebrow" style={{ marginBottom: 18 }}>Instant alerts</div>
            <Lines data-lines className="h-lg" lines={["Be the first to know", "when something", "goes wrong."]} />
            <p className="lede" style={{ marginTop: 22 }}>Get instant email alerts for negative mentions so you can respond quickly and protect your brand reputation. One alert per mention — never a repeat.</p>
            <a href="#pricing" className="link" style={{ marginTop: 26 }}>How alerts work <Arrow /></a>
          </div>
          <div className="stage">
            <div className="win w3"><AlertMock ghost /></div>
            <div className="win w2"><AlertMock ghost /></div>
            <div className="win w1"><AlertMock /></div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ reports */}
      <section className="wrap sec rep">
        <div className="grid12">
          <div style={{ gridColumn: "1 / 8" }}>
            <div className="eyebrow" style={{ marginBottom: 18 }}>Detailed reports</div>
            <Lines data-lines className="h-lg" lines={["Beautiful reports.", "Clear decisions."]} />
          </div>
          <div style={{ gridColumn: "8 / -1", alignSelf: "end" }}>
            <p className="lede">Get in-depth reports, track sentiment over time, and identify trends to make better decisions. Export to PDF or Excel in one click.</p>
          </div>
        </div>
        <div className="frame"><div className="scroller"><Scaled width={1040}><ReportMock /></Scaled></div></div>
      </section>

      {/* ------------------------------------------------ testimonials */}
      <section className="wrap sec tm" style={{ paddingTop: 0 }}>
        <div className="eyebrow" style={{ marginBottom: 18 }}>What teams say</div>
        <Lines data-lines className="h-md" lines={["Built for the people who answer", "for the brand."]} />
        <div className="grid3">
          {QUOTES.map(([q, name, role]) => (
            <div className="quote" key={name}><p>"{q}"</p><div className="who"><b>{name}</b>{role}</div></div>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------ pricing */}
      <PricingSection />

      {/* ------------------------------------------------ final cta */}
      <section className="wrap fin">
        <div className="eyebrow" style={{ marginBottom: 18 }}>How it works</div>
        <Lines data-lines className="h-xl" lines={["Get started", "in minutes."]} />
        <div className="grid12" style={{ marginTop: 40 }}>
          {[["Create your account", "Set up your workspace."], ["Add your brand", "Tell us what to monitor."], ["Choose your sources", "Connect the platforms you care about."], ["Start monitoring", "Get real-time insights."]].map(([t, d], i) => (
            <div key={t} style={{ gridColumn: "span 3", borderTop: "1px solid var(--mk-line)", paddingTop: 16 }}>
              <div className="eyebrow" style={{ marginBottom: 10 }}>0{i + 1}</div>
              <div style={{ fontWeight: 500, fontSize: 15 }}>{t}</div>
              <div className="muted" style={{ fontSize: 13.5, marginTop: 4 }}>{d}</div>
            </div>
          ))}
        </div>
        <div className="row">
          <Link to="/signup" className="btn primary lg">Start monitoring free <Arrow /></Link>
          <Link to="/pricing" className="btn secondary lg">See pricing</Link>
        </div>
        <p className="faint" style={{ marginTop: 16, fontSize: 12.5 }}>{APP_NAME} reads public conversations only. No account access, no integrations to approve.</p>
      </section>

      <MarketingFooter />
    </div>
  );
}
