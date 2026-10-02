"""Visits stored mention URLs and reports the real publish date each page states.

Reads  : JSON file of [{"id": ..., "url": ...}, ...]
Writes : JSON file of [{"id": ..., "url": ..., "date": "<iso>"|null, "note": "..."}]

Used by scripts/backfill_real_dates.ts to repair rows whose publishedAt is really
just the time we scraped them.
"""
import argparse
import json
import sys

from playwright.sync_api import sync_playwright
from date_utils import extract_page_date

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
# Hard bot-wall / dead-page markers only. A generic "Sign in" link appears on plenty
# of pages that still expose a real date, so it must not count as blocked.
BLOCK_WORDS = ["security verification", "not a bot", "cloudflare", "just a moment",
               "blocked by network security", "page not found"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="infile", required=True)
    ap.add_argument("--out", dest="outfile", required=True)
    ap.add_argument("--timeout", type=int, default=25000)
    args = ap.parse_args()

    targets = json.load(open(args.infile, encoding="utf-8"))
    results = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--no-sandbox", "--disable-dev-shm-usage"])
        ctx = browser.new_context(user_agent=UA, viewport={"width": 1280, "height": 900}, locale="en-US")

        for i, t in enumerate(targets, 1):
            url = (t.get("url") or "").strip()
            if not url:
                results.append({**t, "date": None, "note": "no url"})
                continue

            page = ctx.new_page()
            try:
                resp = page.goto(url, wait_until="domcontentloaded", timeout=args.timeout)
                page.wait_for_timeout(2500)
                status = resp.status if resp else 0
                body = (page.evaluate("document.body.innerText") or "")[:400].lower()

                # Always try to extract: some sites (Trustpilot) return a 4xx status while
                # still rendering the real content and its <time> element.
                date = extract_page_date(page)
                if date:
                    results.append({**t, "date": date, "note": f"http{status}"})
                elif any(w in body for w in BLOCK_WORDS):
                    results.append({**t, "date": None, "note": f"blocked/http{status}"})
                else:
                    results.append({**t, "date": None, "note": f"no-date/http{status}"})
            except Exception as e:
                results.append({**t, "date": None, "note": f"{type(e).__name__}"})
            finally:
                page.close()

            if i % 10 == 0:
                sys.stderr.write(f"  ...{i}/{len(targets)}\n")
                sys.stderr.flush()

        browser.close()

    json.dump(results, open(args.outfile, "w", encoding="utf-8"), ensure_ascii=False)
    found = sum(1 for r in results if r["date"])
    sys.stderr.write(f"resolved {found}/{len(results)} real dates\n")


if __name__ == "__main__":
    main()
