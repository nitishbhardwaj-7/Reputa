import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { FeedItem } from "../api/types";
import { api } from "../api/client";
import { sourceOf } from "../brand";
import { Icons, SentimentBadge, SourceIcon, timeAgo, fmtDate } from "./ui";

interface Props {
  item: FeedItem;
  onClose: () => void;
  onChange?: (item: FeedItem) => void;
}

function analysis(item: FeedItem) {
  const src = sourceOf(item.platform, item.url).label;
  const conf = Math.round((item.confidence ?? 0) * 100);
  switch (item.sentiment) {
    case "NEGATIVE":
      return {
        why: `Classified negative with ${conf}% confidence. Mentions on ${src} are public and indexed, so an unanswered complaint keeps surfacing to prospects researching you. ${conf >= 90 ? "The language is unambiguous — treat this as a priority." : "The tone is mixed; read the full thread before responding."}`,
        reply: "Acknowledge the issue specifically, apologize for the experience without disputing details in public, and offer to resolve it over direct message or email. Follow up publicly once it's fixed.",
      };
    case "POSITIVE":
      return {
        why: `Classified positive with ${conf}% confidence. Positive mentions on ${src} build trust with people comparing options and are worth amplifying.`,
        reply: "Thank the author briefly and, if the mention is detailed, ask permission to feature it as a testimonial.",
      };
    default:
      return {
        why: `Classified neutral with ${conf}% confidence — typically a question or a comparison. A helpful answer here positions the brand as the authority in the thread.`,
        reply: "Answer the question directly, link to a relevant resource, and avoid a sales tone.",
      };
  }
}

export function MentionDrawer({ item, onClose, onChange }: Props) {
  const [busy, setBusy] = useState(false);
  const [resolvedAt, setResolvedAt] = useState<string | null | undefined>(item.resolvedAt);
  const src = sourceOf(item.platform, item.url);
  const ai = analysis(item);
  const community = item.type === "post" ? item.author : item.author;
  const url = item.url ?? (item.type === "comment" ? item.post?.url : null) ?? null;

  useEffect(() => {
    setResolvedAt(item.resolvedAt);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [item, onClose]);

  async function toggleResolved() {
    setBusy(true);
    try {
      const res = await api.resolveItem(item.type, item.id, !resolvedAt);
      setResolvedAt(res.resolvedAt);
      onChange?.({ ...item, resolvedAt: res.resolvedAt });
    } finally {
      setBusy(false);
    }
  }

  // Portal: the page container animates with a transform, which would otherwise trap position:fixed.
  return createPortal(
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label="Mention details">
        <div className="d-head">
          <div className="row" style={{ gap: 10 }}>
            <SourceIcon platform={item.platform} url={item.url} size={28} />
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{src.label}</div>
              <div className="faint" style={{ fontSize: 12 }}>{community ? `${community} · ` : ""}{timeAgo(item.publishedAt)}</div>
            </div>
          </div>
          <div className="row" style={{ gap: 6 }}>
            {url && (
              <a className="btn secondary sm" href={url} target="_blank" rel="noreferrer">
                Visit source <span style={{ width: 12, height: 12, display: "inline-flex" }}>{Icons.external}</span>
              </a>
            )}
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close" style={{ width: 28, height: 28 }}>{Icons.close}</button>
          </div>
        </div>

        <div className="d-body">
          <p className="quote">"{item.text || "No text was captured for this mention."}"</p>

          <div className="kv">
            <div className="box"><div className="k">Sentiment</div><SentimentBadge sentiment={item.sentiment} /></div>
            <div className="box"><div className="k">Confidence</div><div className="num" style={{ fontSize: 15, fontWeight: 600 }}>{item.confidence != null ? item.confidence.toFixed(2) : "—"}</div></div>
          </div>

          <div className="d-section">
            <h4>AI analysis</h4>
            <div className="ai">
              <div><div className="faint" style={{ fontSize: 11.5, marginBottom: 4 }}>Why this matters</div><p>{ai.why}</p></div>
              <div><div className="faint" style={{ fontSize: 11.5, marginBottom: 4 }}>Suggested response</div><p>{ai.reply}</p></div>
            </div>
          </div>

          <div className="d-section">
            <h4>Alert history</h4>
            <div className="stack" style={{ gap: 6, fontSize: 13 }}>
              <div className="between"><span className="muted">Analyzed</span><span>{item.analyzedAt ? fmtDate(item.analyzedAt) : "Pending"}</span></div>
              <div className="between"><span className="muted">Email alert</span><span>{item.alertSent ? "Sent to your recipients" : item.sentiment === "NEGATIVE" ? "Queued" : "Not required"}</span></div>
              <div className="between"><span className="muted">Status</span><span>{resolvedAt ? `Resolved ${fmtDate(resolvedAt)}` : "Open"}</span></div>
              <div className="between"><span className="muted">Keyword</span><span>{item.keyword}</span></div>
            </div>
          </div>
        </div>

        <div className="d-foot">
          <button type="button" className={`btn ${resolvedAt ? "secondary" : "primary"}`} onClick={toggleResolved} disabled={busy} style={{ flex: 1 }}>
            {busy ? <span className="spinner" /> : resolvedAt ? "Reopen" : "Mark resolved"}
          </button>
        </div>
      </aside>
    </>,
    document.body,
  );
}
