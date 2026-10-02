import { useState } from "react";
import { Link } from "react-router-dom";
import { Icons } from "../components/ui";
import { Arrow, Lines } from "./Lines";

const PLANS = [
  { id: "starter", name: "Starter", desc: "For individuals and small brands", price: 49, features: ["5,000 mentions / month", "5 sources", "Email alerts", "Basic reports"] },
  { id: "growth", name: "Growth", desc: "For growing businesses", price: 99, popular: true, features: ["25,000 mentions / month", "All sources", "Advanced alerts", "Detailed reports"] },
  { id: "scale", name: "Scale", desc: "For teams and agencies", price: 199, features: ["100,000 mentions / month", "All sources", "Priority support", "Custom reports"] },
];

/** The black pricing block, shared by the landing page and /pricing. */
export function PricingSection({ id = "pricing" }: { id?: string }) {
  const [yearly, setYearly] = useState(false);
  return (
    <section id={id} className="dark pr">
      <div className="wrap">
        <div className="pr-head">
          <div>
            <div className="eyebrow">Simple, transparent pricing</div>
            <Lines data-lines className="h-lg" lines={["Plans for every stage", "of your growth."]} />
            <p className="lede">Start monitoring your brand in minutes. No credit card required.</p>
          </div>
          <div className="toggle">
            <button type="button" className={!yearly ? "on" : ""} onClick={() => setYearly(false)}>Monthly</button>
            <button type="button" className={yearly ? "on" : ""} onClick={() => setYearly(true)}>Yearly <span className="save">Save 20%</span></button>
          </div>
        </div>
        <div className="pr-grid">
          {PLANS.map((p) => {
            const price = yearly ? Math.round(p.price * 0.8) : p.price;
            return (
              <div className={`plan${p.popular ? " featured" : ""}`} key={p.id}>
                {p.popular && <span className="pop">Most popular</span>}
                <div className="pn">{p.name}</div>
                <div className="pd">{p.desc}</div>
                <div className="pp"><b>${price}</b><span>/ month{yearly ? ", billed yearly" : ""}</span></div>
                <ul>{p.features.map((f) => <li key={f}><span className="ck">{Icons.check}</span>{f}</li>)}</ul>
                <Link to="/signup" className={`btn ${p.popular ? "primary" : "secondary"}`}>Start free <Arrow /></Link>
              </div>
            );
          })}
        </div>
        <p className="pr-note">All plans start with a 14-day trial. Multiple brands or white-label reports? <a href="mailto:hello@adaptsmedia.com">Talk to us →</a></p>
      </div>
    </section>
  );
}
