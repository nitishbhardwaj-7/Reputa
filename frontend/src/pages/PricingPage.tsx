import { useLayoutEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { PricingSection } from "../marketing/Pricing";
import { Arrow } from "../marketing/Lines";
import { gsap, ScrollTrigger, reducedMotion, revealLinesAll, useSmoothScroll } from "../lib/motion";
import { MarketingNav, MarketingFooter } from "./MarketingNav";
import "./marketing.css";

export function PricingPage() {
  useSmoothScroll();
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (reducedMotion() || !root.current) return;
    const ctx = gsap.context(() => {
      gsap.from(".mk-nav", { y: -18, opacity: 0, duration: 0.9, ease: "power4.out" });
      ScrollTrigger.create({ start: 20, onUpdate: (s) => root.current!.querySelector(".mk-nav-wrap")?.classList.toggle("scrolled", s.scroll() > 20) });
      revealLinesAll(root.current!);
    }, root);
    return () => ctx.revert();
  }, []);

  return (
    <div className="light with-nav" ref={root}>
      <MarketingNav />
      <PricingSection />
      <section className="wrap faq" style={{ paddingTop: 0 }}>
        <div className="faq-grid">
          {[
            ["What counts as a mention?", "Any post, comment, review, answer or search result that contains one of your keywords. Replies inside a thread count individually so you never miss a buried complaint."],
            ["How fast are alerts?", "Scans run every hour. A negative mention is classified and emailed within the same cycle — typically under 60 minutes from when it was published."],
            ["Can I track competitors?", "Yes, on every plan. Competitor keywords use the same scanners and sentiment engine, and show up in a separate comparison view."],
            ["Do you need access to our accounts?", "No. Reputa only reads public conversations. There is nothing to connect and nothing to authorize."],
          ].map(([q, a]) => <div className="faq-item" key={q}><h3>{q}</h3><p>{a}</p></div>)}
        </div>
        <div className="fin-cta small">
          <h2>Start with a free trial.</h2>
          <Link to="/signup" className="btn primary lg">Create your account <Arrow /></Link>
        </div>
      </section>
      <MarketingFooter />
    </div>
  );
}
