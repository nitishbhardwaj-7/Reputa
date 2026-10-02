import sys
import os
import re
import json
import hashlib
import argparse
import urllib.parse
from datetime import datetime, timezone
from playwright.sync_api import sync_playwright
from date_utils import extract_page_date

# Force UTF-8 encoding on Windows stdout & stderr
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

def parse_args():
    parser = argparse.ArgumentParser(description="Manual TeamBlind Scraper (Deterministic Deduplication)")
    parser.add_argument("--keyword", type=str, default="eb1aexpert", help="Search keyword")
    parser.add_argument("--url", type=str, default="", help="Custom TeamBlind search or post URL")
    parser.add_argument("--limit", type=int, default=100, help="Max items to inspect")
    return parser.parse_args()

def make_stable_id(prefix: str, text: str) -> str:
    """Generate a 100% deterministic hash ID across process runs."""
    h = hashlib.sha256(text.encode('utf-8')).hexdigest()[:16]
    return f"{prefix}_{h}"

def is_english_text(text: str) -> bool:
    if not text or len(text.strip()) < 5:
        return False
    if re.search(r'[\u0600-\u06FF]', text):
        return False
    if not re.search(r'[a-zA-Z]', text):
        return False
    lower = text.lower()
    nav_keywords = [
        "terms of service", "privacy policy", "careers", "about", "press", "contact",
        "sign up", "login", "home", "just a moment", "security service",
        "protect against malicious bots", "verifies you are not a bot", "cloudflare"
    ]
    for kw in nav_keywords:
        if kw in lower:
            return False
    return True

def launch_browser(p):
    args = [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        "--disable-gpu",
    ]
    try:
        return p.chromium.launch(headless=True, args=args)
    except Exception:
        try:
            return p.firefox.launch(headless=True)
        except Exception:
            return p.chromium.launch(headless=True)

def main():
    args = parse_args()
    keyword = args.keyword.strip() or "eb1aexpert"
    
    if args.url and args.url.strip():
        target_url = args.url.strip()
    else:
        encoded_q = urllib.parse.quote(keyword)
        target_url = f"https://www.teamblind.com/search/{encoded_q}"

    items = []
    
    try:
        with sync_playwright() as p:
            browser = launch_browser(p)
            context = browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                locale="en-US",
                extra_http_headers={"Accept-Language": "en-US,en;q=0.9"},
                viewport={"width": 1280, "height": 800}
            )
            page = context.new_page()

            page.goto(target_url, wait_until="domcontentloaded", timeout=30000)
            page.wait_for_timeout(4000)

            page.evaluate("window.scrollBy(0, 1500)")
            page.wait_for_timeout(1500)

            post_links = page.evaluate("""() => {
                const results = [];
                const seen = new Set();
                document.querySelectorAll('a').forEach(a => {
                    const href = a.href;
                    const text = a.innerText ? a.innerText.trim() : '';
                    if (href.includes('/post/') || href.includes('/article/')) {
                        const cleanHref = href.split('?')[0].split('#')[0];
                        if (!seen.has(cleanHref)) {
                            seen.add(cleanHref);
                            results.push({ url: cleanHref, title: text });
                        }
                    }
                });
                return results;
            }""")

            text_nodes = page.evaluate("""() => {
                return Array.from(document.querySelectorAll('p, .post_body, .comment_body, [class*="article"]'))
                    .map(el => el.innerText ? el.innerText.trim() : '')
                    .filter(txt => txt.length > 25);
            }""")

            if post_links:
                for idx, pl in enumerate(post_links[:args.limit]):
                    p_url = pl['url']
                    q_id = make_stable_id("blind_post", p_url)
                    
                    raw_title = pl['title']
                    if not raw_title or len(raw_title) < 5:
                        slug = p_url.split('/post/')[-1].split('-')[:-1]
                        raw_title = " ".join(slug).capitalize() or f"TeamBlind post on {keyword}"

                    post_page = context.new_page()
                    p_text = raw_title
                    p_comments = []
                    p_date = None

                    try:
                        post_page.goto(p_url, wait_until="domcontentloaded", timeout=20000)
                        post_page.wait_for_timeout(2500)

                        extracted_post = post_page.evaluate("""() => {
                            const title = document.title.replace('- Blind', '').replace('Blind', '').trim();
                            const paragraphs = Array.from(document.querySelectorAll('p, .post_body, .comment_body, [class*="article"]'))
                                .map(el => el.innerText ? el.innerText.trim() : '')
                                .filter(txt => txt.length > 15);
                            return { title, paragraphs };
                        }""")

                        p_date = extract_page_date(post_page)

                        if extracted_post.get("title") and len(extracted_post["title"]) > 5:
                            raw_title = extracted_post["title"]

                        paragraphs = extracted_post.get("paragraphs", [])
                        if paragraphs:
                            p_text = f"{raw_title}\n\n{paragraphs[0]}"
                            p_comments = paragraphs[1:8]

                    except Exception as p_err:
                        sys.stderr.write(f"Error fetching post {p_url}: {p_err}\n")
                    finally:
                        post_page.close()

                    post_item = {
                        "type": "post",
                        "id": q_id,
                        "platform": "teamblind",
                        "text": p_text,
                        "title": raw_title,
                        "url": p_url,
                        "author": "Blind User",
                        "authorUrl": None,
                        "publishedAt": p_date,
                        "likes": 0,
                        "shares": 0,
                        "commentsCount": len(p_comments),
                        "comments": []
                    }

                    for c_idx, c_txt in enumerate(p_comments):
                        c_id = make_stable_id("blind_comment", f"{q_id}::{c_txt}")
                        post_item["comments"].append({
                            "type": "comment",
                            "id": c_id,
                            "postId": q_id,
                            "text": c_txt,
                            "url": p_url,
                            "author": "Blind User",
                            # Per-comment dates aren't exposed by this extraction.
                            "publishedAt": None,
                            "likes": 0
                        })

                    items.append(post_item)

            elif text_nodes:
                q_id = make_stable_id("blind_post_direct", target_url)
                page_title = page.title().replace("- Blind", "").replace("Blind", "").strip() or f"TeamBlind post on {keyword}"
                direct_date = extract_page_date(page)
                post_item = {
                    "type": "post",
                    "id": q_id,
                    "platform": "teamblind",
                    "text": f"{page_title}\n\n{text_nodes[0]}",
                    "title": page_title,
                    "url": target_url,
                    "author": "Blind User",
                    "authorUrl": None,
                    "publishedAt": direct_date,
                    "likes": 0,
                    "shares": 0,
                    "commentsCount": max(0, len(text_nodes) - 1),
                    "comments": []
                }
                for i, t in enumerate(text_nodes[1:10]):
                    c_id = make_stable_id("blind_comment_direct", f"{q_id}::{t}")
                    post_item["comments"].append({
                        "type": "comment",
                        "id": c_id,
                        "postId": q_id,
                        "text": t,
                        "url": target_url,
                        "author": "Blind User",
                        "publishedAt": None,
                        "likes": 0
                    })
                items.append(post_item)

            browser.close()

    except Exception as err:
        sys.stderr.write(f"TeamBlind scraper error: {str(err)}\n")
        sys.exit(1)

    print(json.dumps(items, ensure_ascii=False))

if __name__ == "__main__":
    main()
