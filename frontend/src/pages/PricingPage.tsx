import { useState } from "react";
import { Link } from "react-router-dom";
import { Icons } from "../components/ui";
import { MarketingNav, MarketingFooter } from "./MarketingNav";
import "./marketing.css";

const PLANS = [
  { id: "starter", name: "Starter", desc: "For individuals and small brands", price: 49, features: ["5,000 mentions / month", "5 sources", "Email alerts", "Basic reports"] },
  { id: "growth", name: "Growth", desc: "For growing businesses", price: 99, popular: true, features: ["25,000 mentions / month", "All sources", "Advanced alerts", "Detailed reports"] },
  { id: "scale", name: "Scale", desc: "For teams and agencies", price: 199, features: ["100,000 mentions / month", "All sources", "Priority support", "Custom reports"] },
];

export function PricingPage() {
  const [yearly, setYearly] = useState(false);
  return (
    <div className="light">
      <MarketingNav />
      <section className="wrap section" style={{ paddingTop: 64 }}>
        <div className="sec-head center">
          <div className="eyebrow">Pricing</div>
          <h2>Simple, transparent pricing to fit your needs.</h2>
          <p>Start monitoring your brand in minutes. No credit card required.</p>
        </div>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <div className="toggle">
            <button type="button" className={!yearly ? "on" : ""} onClick={() => setYearly(false)}>Monthly</button>
            <button type="button" className={yearly ? "on" : ""} onClick={() => setYearly(true)}>Yearly <span className="save">Save 20%</span></button>
          </div>
        </div>
        <div className="pricing">
          {PLANS.map((p) => {
            const price = yearly ? Math.round(p.price * 0.8) : p.price;
            return (
              <div className={`plan${p.popular ? " featured" : ""}`} key={p.id}>
                {p.popular && <span className="pop">Most popular</span>}
                <div className="pn">{p.name}</div>
                <div className="pd">{p.desc}</div>
                <div className="pp"><b>${price}</b><span>/ month{yearly ? ", billed yearly" : ""}</span></div>
                <ul>{p.features.map((f) => <li key={f}><span style={{ display: "inline-flex" }}>{Icons.check}</span>{f}</li>)}</ul>
                <div className="sp" />
                <Link to="/signup" className={`btn ${p.popular ? "primary" : "secondary"}`}>Start free</Link>
              </div>
            );
          })}
        </div>
        <p className="muted" style={{ textAlign: "center", marginTop: 22, fontSize: 13 }}>
          All plans start with a free trial. Need multiple brands or white-label reports? <a href="mailto:hello@adaptsmedia.com" style={{ textDecoration: "underline" }}>Talk to us</a>.
        </p>
      </section>
      <MarketingFooter />
    </div>
  );
}
