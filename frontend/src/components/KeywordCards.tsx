import { useState, type FormEvent } from "react";
import type { CardStats } from "../api/types";
import { TRACKABLE_SOURCES } from "../brand";
import { Icons, SourceIcon, timeAgo } from "./ui";

/** A keyword (or a competitor) tracked on one platform. */
export interface TrackedCard {
  id: string;
  platform: string;
  keyword: string;
  enabled: boolean;
  lastRunAt?: string | null;
  stats?: CardStats;
}

interface Props {
  cards: TrackedCard[];
  /** What a card is called in buttons and empty states. */
  noun: "keyword" | "competitor";
  /** Id of the action in flight (disables every control while something is running). */
  busy: string | null;
  placeholder: (platform: string) => string;
  onAdd: (platform: string, keyword: string) => Promise<boolean>;
  onRun: (card: TrackedCard) => void;
  onToggle: (card: TrackedCard) => void;
  onDelete: (card: TrackedCard) => void;
}

function AddCard({ platform, label, noun, busy, placeholder, onAdd }: { platform: string; label: string; noun: string; busy: boolean; placeholder: string; onAdd: Props["onAdd"] }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!value.trim() || saving) return;
    setSaving(true);
    const ok = await onAdd(platform, value.trim());
    setSaving(false);
    if (ok) {
      setValue("");
      setOpen(false);
    }
  }

  return (
    <div className="kw-card add">
      {open ? (
        <form onSubmit={submit}>
          <label style={{ fontSize: 12.5, fontWeight: 500 }}>New {noun} on {label}</label>
          <input autoFocus value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} onKeyDown={(e) => e.key === "Escape" && setOpen(false)} />
          <div className="row" style={{ gap: 6 }}>
            <button type="submit" className="btn primary sm" disabled={!value.trim() || saving || busy}>{saving ? <span className="spinner" /> : "Add card"}</button>
            <button type="button" className="btn ghost sm" onClick={() => { setOpen(false); setValue(""); }}>Cancel</button>
          </div>
        </form>
      ) : (
        <button type="button" className="open" onClick={() => setOpen(true)}>
          {Icons.plus}Add {noun}
        </button>
      )}
    </div>
  );
}

/** Cards grouped by platform: see what is tracked where, add a card to a platform, pause, scan or delete one. */
export function KeywordCards({ cards, noun, busy, placeholder, onAdd, onRun, onToggle, onDelete }: Props) {
  return (
    <>
      {TRACKABLE_SOURCES.map((src) => {
        const list = cards.filter((c) => c.platform === src.id);
        return (
          <section className="kw-section" key={src.id}>
            <div className="kw-head">
              <SourceIcon platform={src.id} size={22} />
              <h3>{src.label}</h3>
              <span className="badge quiet">{list.length} card{list.length === 1 ? "" : "s"}</span>
              <span className="hint">{src.hint}</span>
            </div>
            <div className="kw-grid">
              {list.map((c) => {
                const s = c.stats;
                return (
                  <div className={`kw-card${c.enabled ? "" : " paused"}`} key={c.id}>
                    <div className="top">
                      <span className="name">{c.keyword}</span>
                      <span className={`badge ${c.enabled ? "positive" : "quiet"}`}>{c.enabled ? "Active" : "Paused"}</span>
                    </div>
                    <div className="nums">
                      <span><b>{(s?.mentions ?? 0).toLocaleString()}</b> mentions</span>
                      {s && s.mentions > 0 && <span><b className="pos">{s.positive}</b> pos</span>}
                      {s && s.mentions > 0 && <span><b className="neg">{s.negative}</b> neg</span>}
                    </div>
                    <div className="foot">
                      <span className="when">{c.lastRunAt ? `Scanned ${timeAgo(c.lastRunAt)}` : "Not scanned yet"}</span>
                      <button type="button" className="icon-act" title="Scan now" aria-label={`Scan ${c.keyword} now`} disabled={busy !== null || !c.enabled} onClick={() => onRun(c)}>
                        {busy === `run-${c.id}` ? <span className="spinner" /> : Icons.refresh}
                      </button>
                      <button type="button" className="icon-act" title={c.enabled ? "Pause" : "Resume"} aria-label={`${c.enabled ? "Pause" : "Resume"} ${c.keyword}`} disabled={busy !== null} onClick={() => onToggle(c)}>
                        {c.enabled ? Icons.pause : Icons.play}
                      </button>
                      <button type="button" className="icon-act danger" title="Delete card" aria-label={`Delete ${c.keyword}`} disabled={busy !== null} onClick={() => onDelete(c)}>
                        {Icons.trash}
                      </button>
                    </div>
                  </div>
                );
              })}
              <AddCard platform={src.id} label={src.label} noun={noun} busy={busy !== null} placeholder={placeholder(src.id)} onAdd={onAdd} />
            </div>
          </section>
        );
      })}
    </>
  );
}
