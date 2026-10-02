import { useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

gsap.registerPlugin(ScrollTrigger);
export { gsap, ScrollTrigger };
if (import.meta.env.DEV) (window as any).__ST = ScrollTrigger;

export const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Smooth scrolling for marketing pages, wired into ScrollTrigger. No-op when the user prefers reduced motion. */
export function useSmoothScroll() {
  useEffect(() => {
    if (reducedMotion()) return;
    const lenis = new Lenis({ lerp: 0.11, smoothWheel: true, anchors: true });
    lenis.on("scroll", ScrollTrigger.update);
    const tick = (t: number) => lenis.raf(t * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    return () => {
      gsap.ticker.remove(tick);
      lenis.destroy();
    };
  }, []);
}

/** Animate every `[data-count]` number once it scrolls into view. */
export function countUpAll(scope: Element) {
  scope.querySelectorAll<HTMLElement>("[data-count]").forEach((el) => {
    const target = Number(el.dataset.count);
    const decimals = el.dataset.decimals ? Number(el.dataset.decimals) : 0;
    const suffix = el.dataset.suffix ?? "";
    const o = { v: 0 };
    gsap.to(o, {
      v: target,
      duration: 1.4,
      ease: "power2.out",
      scrollTrigger: { trigger: el, start: "top 90%", once: true },
      onUpdate: () => { el.textContent = o.v.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + suffix; },
    });
  });
}

/** Masked line reveals for every `[data-lines]` block (hero handles its own). */
export function revealLinesAll(scope: Element) {
  scope.querySelectorAll<HTMLElement>("[data-lines]").forEach((el) => {
    const lines = el.querySelectorAll(".ln-in");
    if (!lines.length) return;
    gsap.from(lines, {
      yPercent: 110,
      duration: 0.95,
      ease: "power4.out",
      stagger: 0.08,
      scrollTrigger: { trigger: el, start: "top 86%", once: true },
    });
  });
}

/** Chart strokes with pathLength="1" draw themselves when they enter the viewport. */
export function drawAll(scope: Element) {
  scope.querySelectorAll<SVGElement>("[data-draw]").forEach((svg) => {
    const strokes = svg.querySelectorAll(".draw");
    const bars = svg.querySelectorAll(".grow");
    if (strokes.length) gsap.from(strokes, {
      strokeDashoffset: 1,
      duration: 1.3,
      ease: "power2.inOut",
      stagger: 0.12,
      scrollTrigger: { trigger: svg, start: "top 88%", once: true },
    });
    if (bars.length) gsap.from(bars, {
      scaleY: 0,
      transformOrigin: "bottom",
      duration: 0.9,
      ease: "power3.out",
      stagger: 0.05,
      scrollTrigger: { trigger: svg, start: "top 88%", once: true },
    });
  });
}
