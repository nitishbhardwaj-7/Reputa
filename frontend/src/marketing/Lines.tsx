import type { ReactNode } from "react";

/** Headline split into overflow-masked lines so GSAP can slide each one in. */
export function Lines({ lines, className, as: Tag = "h2", ...rest }: { lines: ReactNode[]; className?: string; as?: "h1" | "h2" | "h3" | "p"; [k: string]: unknown }) {
  return (
    <Tag className={className} {...rest}>
      {lines.map((l, i) => (
        <span className="ln" key={i}><span className="ln-in">{l}</span></span>
      ))}
    </Tag>
  );
}

export const Arrow = () => (
  <span className="arr"><svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg></span>
);
