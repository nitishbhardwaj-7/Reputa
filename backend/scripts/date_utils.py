"""Shared date extraction for the platform scrapers.

Rule: never invent a date. If the real publish date can't be determined we return
None, and the dashboard shows "Unknown date" instead of the scrape time. Storing
datetime.now() made every such mention look like it was posted today, which
polluted the date filters and the sentiment-over-time chart.
"""
import re
from datetime import datetime, timedelta, timezone
from typing import Optional

_REL_RE = re.compile(r"^(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago", re.I)
_ABS_PREFIX_RE = re.compile(
    r"^([A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})\s*[\u2014\-\u2013\.]"
)
_REL_PREFIX_RE = re.compile(
    r"^(\d+\s+(?:second|minute|hour|day|week|month|year)s?\s+ago)\s*[\u2014\-\u2013\.]", re.I
)

_FORMATS = (
    "%b %d, %Y", "%B %d, %Y", "%b %d %Y", "%B %d %Y",
    "%d %b %Y", "%d %B %Y", "%Y-%m-%d", "%m/%d/%Y", "%d/%m/%Y", "%Y/%m/%d",
)


def parse_serp_date(raw: Optional[str], snippet: str = "") -> Optional[str]:
    """Parse a search-result date. Returns an ISO string, or None if unknown."""
    raw_str = (raw or "").strip()

    if not raw_str and snippet:
        m = _ABS_PREFIX_RE.match(snippet)
        if m:
            raw_str = m.group(1).strip()
        else:
            m_rel = _REL_PREFIX_RE.match(snippet)
            if m_rel:
                raw_str = m_rel.group(1).strip()

    if not raw_str:
        return None

    rel = _REL_RE.match(raw_str)
    if rel:
        num = int(rel.group(1))
        unit = rel.group(2).lower()
        now = datetime.now(timezone.utc)
        deltas = {
            "second": timedelta(seconds=num),
            "minute": timedelta(minutes=num),
            "hour": timedelta(hours=num),
            "day": timedelta(days=num),
            "week": timedelta(weeks=num),
            "month": timedelta(days=num * 30),
            "year": timedelta(days=num * 365),
        }
        return (now - deltas[unit]).isoformat()

    for fmt in _FORMATS:
        try:
            return datetime.strptime(raw_str, fmt).replace(tzinfo=timezone.utc).isoformat()
        except Exception:
            pass

    try:
        return datetime.fromisoformat(raw_str.replace("Z", "+00:00")).isoformat()
    except Exception:
        return None


# Reads the publish date a page states about itself, in the order sites are most
# likely to get right: schema.org JSON-LD, then OpenGraph/meta, then <time>.
_PAGE_DATE_JS = """() => {
  const out = [];
  for (const el of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const walk = (node) => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) { node.forEach(walk); return; }
        for (const k of ['datePublished', 'dateCreated', 'uploadDate']) {
          if (typeof node[k] === 'string') out.push(node[k]);
        }
        Object.values(node).forEach(walk);
      };
      walk(JSON.parse(el.textContent || 'null'));
    } catch (e) { /* malformed JSON-LD */ }
  }
  const metaNames = [
    'article:published_time', 'og:published_time', 'datePublished',
    'publish-date', 'pubdate', 'date',
  ];
  for (const name of metaNames) {
    const el = document.querySelector(`meta[property="${name}"], meta[itemprop="${name}"], meta[name="${name}"]`);
    const v = el && el.getAttribute('content');
    if (v) out.push(v);
  }
  for (const t of document.querySelectorAll('time')) {
    const v = t.getAttribute('datetime') || t.getAttribute('title') || t.innerText;
    if (v) out.push(v.trim());
  }
  return out;
}"""


def extract_page_date(page) -> Optional[str]:
    """Best-effort real publish date for the page currently loaded. None if absent."""
    try:
        candidates = page.evaluate(_PAGE_DATE_JS) or []
    except Exception:
        return None

    now = datetime.now(timezone.utc)
    for cand in candidates:
        iso = parse_serp_date(cand)
        if not iso:
            continue
        try:
            dt = datetime.fromisoformat(iso)
        except Exception:
            continue
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        # Ignore nonsense: future dates, or anything before social media existed.
        if dt > now + timedelta(days=1) or dt.year < 2005:
            continue
        return dt.isoformat()
    return None
