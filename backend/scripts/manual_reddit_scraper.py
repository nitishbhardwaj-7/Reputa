import sys
import os
import json
import argparse
import urllib.parse
from datetime import datetime, timezone
from playwright.sync_api import sync_playwright

# Force stdout & stderr to use UTF-8 on Windows
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

def parse_args():
    parser = argparse.ArgumentParser(description="Manual Reddit Scraper")
    parser.add_argument("--keyword", type=str, default="eb1aexperts.com", help="Search keyword")
    parser.add_argument("--url", type=str, default="", help="Custom Reddit search URL")
    parser.add_argument("--limit", type=int, default=100, help="Max posts to inspect")
    return parser.parse_args()

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

# Reddit nests each comment's replies inside data.replies as another Listing.
# Walking it recursively is the only way to get more than the top-level comments;
# previously ~75% of a thread was dropped on the floor. Depth-first order means a
# parent is always emitted before its children, which the ingest relies on to
# resolve parent ids.
MAX_COMMENT_DEPTH = 12


def flatten_comments(children, p_id, depth=0, parent_id=None):
    out = []
    if depth > MAX_COMMENT_DEPTH:
        return out

    for child in children or []:
        kind = child.get("kind")
        cdata = child.get("data", {}) or {}

        # "more" stubs are collapsed threads Reddit didn't inline. Expanding them
        # needs an extra API call per stub; we skip them but don't pretend they
        # aren't there.
        if kind != "t1":
            continue

        c_id = cdata.get("id")
        c_body = cdata.get("body")
        if not c_id or not c_body:
            continue

        c_created = cdata.get("created_utc")
        c_pub_date = datetime.fromtimestamp(c_created, timezone.utc).isoformat() if c_created else None
        this_id = f"reddit_comment_{c_id}"

        out.append({
            "type": "comment",
            "id": this_id,
            "postId": f"reddit_post_{p_id}",
            "parentId": parent_id,
            "depth": depth,
            "text": c_body,
            "url": "https://www.reddit.com" + cdata.get("permalink", ""),
            "author": cdata.get("author") or "reddit_user",
            "authorUrl": f"https://www.reddit.com/user/{cdata.get('author')}" if cdata.get("author") else None,
            "publishedAt": c_pub_date,
            "likes": cdata.get("score", 0),
        })

        replies = cdata.get("replies")
        if isinstance(replies, dict):
            out.extend(flatten_comments(
                replies.get("data", {}).get("children", []),
                p_id,
                depth + 1,
                this_id,
            ))

    return out


def main():
    args = parse_args()
    keyword = args.keyword.strip() or "eb1aexperts.com"
    
    if args.url and args.url.strip():
        target_url = args.url.strip()
    else:
        encoded_q = urllib.parse.quote(keyword)
        target_url = f"https://www.reddit.com/search/?type=comments&q={encoded_q}&sort=relevance&safe=0"

    items = []
    
    try:
        with sync_playwright() as p:
            browser = launch_browser(p)
            context = browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                viewport={"width": 1280, "height": 800}
            )
            page = context.new_page()

            # 1) Load search results
            page.goto(target_url, wait_until="domcontentloaded", timeout=30000)
            page.wait_for_timeout(3500)

            # Scroll to trigger lazy loading of search result cards
            page.evaluate("window.scrollBy(0, 1500)")
            page.wait_for_timeout(1500)

            # 2) Collect all post permalinks
            permalinks_raw = page.evaluate("""() => {
                const links = Array.from(document.querySelectorAll('a[href*="/comments/"]'));
                return links.map(a => a.href);
            }""")

            unique_post_urls = []
            seen_post_ids = set()

            for link in permalinks_raw:
                if "/comments/" not in link:
                    continue
                parts = link.split("/comments/")
                if len(parts) > 1:
                    post_id = parts[1].split("/")[0]
                    if post_id and post_id not in seen_post_ids:
                        seen_post_ids.add(post_id)
                        # Extract clean base post link
                        clean_base = link.split("?")[0]
                        sub_parts = clean_base.split("/comments/" + post_id)
                        post_base_url = clean_base.split("/comments/")[0] + "/comments/" + post_id
                        if len(sub_parts) > 1 and sub_parts[1]:
                            slug = sub_parts[1].split("/")[1] if len(sub_parts[1].split("/")) > 1 else ""
                            if slug:
                                post_base_url += "/" + slug
                        unique_post_urls.append(post_base_url)
                        if len(unique_post_urls) >= args.limit:
                            break

            # 3) For each post URL, fetch its full .json endpoint inside the browser session
            for post_url in unique_post_urls:
                json_url = post_url.rstrip("/") + ".json?limit=500&depth=12&raw_json=1"
                try:
                    res = page.goto(json_url, timeout=15000)
                    if not res or res.status != 200:
                        continue
                    text_data = res.text()
                    json_data = json.loads(text_data)

                    if not isinstance(json_data, list) or len(json_data) < 2:
                        continue

                    # Extract Post Data
                    post_listing = json_data[0]
                    post_children = post_listing.get("data", {}).get("children", [])
                    if not post_children:
                        continue

                    pdata = post_children[0].get("data", {})
                    p_id = pdata.get("id")
                    if not p_id:
                        continue

                    p_created = pdata.get("created_utc")
                    pub_date = datetime.fromtimestamp(p_created, timezone.utc).isoformat() if p_created else None

                    post_item = {
                        "type": "post",
                        "id": f"reddit_post_{p_id}",
                        "platform": "reddit",
                        "text": pdata.get("title", "") + ("\n\n" + pdata.get("selftext", "") if pdata.get("selftext") else ""),
                        "title": pdata.get("title", ""),
                        "url": "https://www.reddit.com" + pdata.get("permalink", f"/comments/{p_id}"),
                        "author": pdata.get("author") or "reddit_user",
                        "authorUrl": f"https://www.reddit.com/user/{pdata.get('author')}" if pdata.get("author") else None,
                        "publishedAt": pub_date,
                        "likes": pdata.get("score", 0),
                        "shares": pdata.get("num_crossposts", 0),
                        "commentsCount": pdata.get("num_comments", 0),
                        "comments": []
                    }

                    # Extract Comments Data, walking the full reply tree.
                    comments_listing = json_data[1]
                    c_children = comments_listing.get("data", {}).get("children", [])
                    post_item["comments"] = flatten_comments(c_children, p_id)

                    items.append(post_item)

                except Exception as ex:
                    # Ignore individual post fetch failures
                    continue

            browser.close()

    except Exception as err:
        sys.stderr.write(f"Reddit scraper error: {str(err)}\n")
        sys.exit(1)

    # Output JSON array to stdout with UTF-8 encoding
    print(json.dumps(items, ensure_ascii=False))

if __name__ == "__main__":
    main()
