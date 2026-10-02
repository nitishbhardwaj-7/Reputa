#!/usr/bin/env python3
"""
Google / Brand Scraper Engine for ORM Dashboard.
Based on SearchApi.io integration with multi-engine support, deduplication, filtering,
and MongoDB / SQLite persistent storage.
"""

import argparse
import hashlib
import io
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

try:
    import trafilatura
except ImportError:
    trafilatura = None

ROOT = os.path.dirname(os.path.abspath(__file__))
BACKEND_ROOT = os.path.dirname(ROOT)
CONFIG_PATH = os.path.join(ROOT, "config.json")
ENV_PATH = os.path.join(BACKEND_ROOT, ".env")
SERPER_SEARCH_URL = "https://google.serper.dev/search"
SERPER_NEWS_URL = "https://google.serper.dev/news"

TRACKING_PREFIXES = re.compile(r"^(utm_|mc_|_ga|s_kwcid|pk_|piwik_)", re.I)

TRACKING_EXACT = {
    "fbclid", "gclid", "gbraid", "wbraid", "msclkid", "yclid", "dclid",
    "igshid", "twclid", "ttclid", "campaign", "ref", "ref_src", "referrer",
    "source", "src", "cmpid", "spm", "hl", "lang", "language", "locale",
    "gl", "cr", "ie", "oe", "lr",
}

def _is_tracking_param(name):
    return name.lower() in TRACKING_EXACT or bool(TRACKING_PREFIXES.match(name))

REDIRECT_HOSTS = re.compile(
    r"^(www\.)?(google\.[a-z.]+/(goto|url)|news\.google\.com/)", re.I)

UA = "Mozilla/5.0 (compatible; ORMDashboard-GoogleScraper/1.0)"


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


_NO_REDIRECT = urllib.request.build_opener(_NoRedirect)


def log(msg):
    stamp = datetime.now().strftime("%H:%M:%S")
    print("[%s] %s" % (stamp, msg), file=sys.stderr, flush=True)


def die(msg):
    print("ERROR: %s" % msg, file=sys.stderr)
    sys.exit(1)


class QuotaError(RuntimeError):
    pass


def load_env(path=ENV_PATH):
    env = {}
    if os.path.exists(path):
        with io.open(path, encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, val = line.partition("=")
                env[key.strip()] = val.strip().strip('"').strip("'")
    known = ["SERPER_API_KEY", "SEARCHAPI_KEY", "SMTP_HOST", "SMTP_PORT", "SMTP_USER",
             "SMTP_PASS", "MAIL_FROM", "MAIL_TO", "SLACK_WEBHOOK",
             "MONGODB_URI", "MONGODB_DB"]
    for key in list(env) + known:
        if os.environ.get(key):
            env[key] = os.environ[key]
    return env


def load_config(path=CONFIG_PATH):
    if os.path.exists(path):
        try:
            with io.open(path, encoding="utf-8") as fh:
                return json.load(fh)
        except Exception:
            pass
    return {
        "brand": {
            "name": "EB1A Experts",
            "queries": ["\"EB1A Experts\"", "\"EB-1A Experts\"", "eb1aexperts.com"],
            "own_domains": ["eb1aexperts.com"]
        },
        "sources": [
            {"id": "google_news", "engine": "google_news", "enabled": True, "every_minutes": 60, "pages": 1, "params": {"gl": "us", "hl": "en"}},
            {"id": "google_web", "engine": "google", "enabled": True, "every_minutes": 360, "pages": 2, "params": {"gl": "us", "hl": "en"}},
            {"id": "bing_web", "engine": "bing", "enabled": True, "every_minutes": 720, "pages": 1, "params": {}},
            {"id": "youtube", "engine": "youtube", "enabled": True, "every_minutes": 1440, "pages": 1, "params": {}}
        ],
        "filters": {
            "exclude_domains": [
                "indeed.com", "glassdoor.com", "linkedin.com/jobs", "ziprecruiter.com",
                "naukri.com", "pinterest.com", "zoominfo.com", "rocketreach.co"
            ],
            "exclude_title_terms": ["hiring", "job opening", "careers at", "vacancy"],
            "require_brand_in_text": False
        },
        "api": {
            "delay_between_calls_seconds": 0.5,
            "max_retries": 3,
            "timeout_seconds": 30
        }
    }


MENTION_FIELDS = ("id", "title_key", "norm_url", "url", "title", "snippet",
                  "domain", "platform", "source_id", "engine", "query",
                  "published", "first_seen", "date_status")

PLATFORMS = [
    ("Reddit",    ["reddit.com"]),
    ("YouTube",   ["youtube.com", "youtu.be"]),
    ("News",      ["news.google.com", "techcrunch.com", "reuters.com", "bloomberg.com",
                   "forbes.com", "wsj.com", "nytimes.com", "cnn.com", "bbc.com",
                   "businessinsider.com", "cnet.com", "verge.com", "zdnet.com"]),
    ("Reviews",   ["trustpilot.com", "clutch.co", "glassdoor.com", "ambitionbox.com",
                   "g2.com", "capterra.com", "bbb.org", "scam-detector.com"]),
    ("Directory", ["crunchbase.com", "zoominfo.com", "rocketreach.co", "apollo.io",
                   "signalhire.com", "pitchbook.com"]),
    ("X",         ["x.com", "twitter.com"]),
    ("LinkedIn",  ["linkedin.com"]),
    ("Facebook",  ["facebook.com", "fb.com"]),
    ("TikTok",    ["tiktok.com"]),
    ("Threads",   ["threads.net"]),
    ("Blind",     ["teamblind.com"]),
    ("Medium",    ["medium.com"]),
    ("Quora",     ["quora.com"]),
]


def platform_of(domain, source_id=""):
    if source_id == "google_news":
        return "News"
    if source_id == "youtube":
        return "YouTube"
    dom = (domain or "").lower()
    for name, list_ in PLATFORMS:
        if any(dom == target or dom.endswith("." + target) for target in list_):
            return name
    return "Web"


class Store:
    """MongoDB store for Google mentions, run tracking, and redirect cache."""

    def __init__(self, uri, dbname="brandmonitor"):
        try:
            from pymongo import MongoClient
            from pymongo.errors import PyMongoError
        except ImportError:
            die("pymongo is required. Install with: python -m pip install pymongo")
        self._error = PyMongoError
        self.dbname = dbname
        self.client = MongoClient(
            uri,
            serverSelectionTimeoutMS=4000,
            connectTimeoutMS=4000,
            tlsAllowInvalidCertificates=True,
            appname="brand-monitor"
        )
        self.db = self.client[dbname]
        self._schema()

    def _schema(self):
        try:
            self.db.mentions.create_index("first_seen")
            self.db.mentions.create_index("notified")
            self.db.mentions.create_index("platform")
        except Exception:
            pass

    def seen(self, mid, tkey):
        try:
            if self.db.mentions.find_one({"_id": mid}, {"_id": 1}):
                return True
            if tkey and self.db.mentions.find_one({"title_key": tkey}, {"_id": 1}):
                return True
        except Exception:
            pass
        return False

    def add(self, row):
        doc = {k: row.get(k) for k in MENTION_FIELDS}
        doc["_id"] = doc.pop("id")
        doc["notified"] = 0
        try:
            self.db.mentions.insert_one(doc)
        except Exception as exc:
            if "duplicate key" not in str(exc).lower():
                pass

    @staticmethod
    def _out(doc):
        doc = dict(doc)
        doc["id"] = doc.pop("_id")
        if not doc.get("platform"):
            doc["platform"] = platform_of(doc.get("domain"), doc.get("source_id"))
        if not doc.get("date_status"):
            pub = (doc.get("published") or "").strip()
            if not pub:
                doc["date_status"] = "unknown"
            elif re.search(r"\b(?:second|minute|hour|day|week|month|year)s?\s+ago\b", pub, re.I):
                doc["date_status"] = "estimated"
            else:
                doc["date_status"] = "confirmed"
        return doc

    def pending(self):
        try:
            return [self._out(d) for d in
                    self.db.mentions.find({"notified": 0}).sort("first_seen", -1)]
        except Exception:
            return []

    def mark_notified(self, ids):
        if ids:
            try:
                self.db.mentions.update_many({"_id": {"$in": list(ids)}},
                                             {"$set": {"notified": 1}})
            except Exception:
                pass

    def since(self, iso):
        try:
            return [self._out(d) for d in
                    self.db.mentions.find({"first_seen": {"$gte": iso}})
                    .sort("first_seen", -1)]
        except Exception:
            return []

    def all_mentions(self, platform=None, query=None, limit=2000):
        try:
            find = {}
            if platform and platform != "All":
                find["platform"] = platform
            if query:
                safe = re.escape(query)
                find["$or"] = [{"title": {"$regex": safe, "$options": "i"}},
                               {"snippet": {"$regex": safe, "$options": "i"}},
                               {"domain": {"$regex": safe, "$options": "i"}}]
            cur = self.db.mentions.find(find).sort("first_seen", -1).limit(limit)
            return [self._out(d) for d in cur]
        except Exception:
            return []

    def platform_counts(self):
        try:
            out = {}
            for doc in self.db.mentions.aggregate(
                    [{"$group": {"_id": "$platform", "n": {"$sum": 1}}}]):
                out[doc["_id"] or "Web"] = doc["n"]
            return out
        except Exception:
            return {}

    def total(self):
        try:
            return self.db.mentions.count_documents({})
        except Exception:
            return 0

    def backfill_platforms(self):
        try:
            n = 0
            for doc in self.db.mentions.find(
                    {"$or": [{"platform": None}, {"platform": {"$exists": False}}]},
                    {"domain": 1, "source_id": 1}):
                self.db.mentions.update_one(
                    {"_id": doc["_id"]},
                    {"$set": {"platform": platform_of(doc.get("domain"),
                                                      doc.get("source_id"))}})
                n += 1
            return n
        except Exception:
            return 0

    def last_run(self, source_id):
        try:
            doc = self.db.runs.find_one({"_id": source_id})
            return doc["last_run"] if doc else None
        except Exception:
            return None

    def set_last_run(self, source_id):
        try:
            self.db.runs.update_one(
                {"_id": source_id},
                {"$set": {"last_run": datetime.now(timezone.utc).isoformat()}},
                upsert=True)
        except Exception:
            pass

    def is_due(self, source_id, every_minutes, force=False):
        if force:
            return True
        last = self.last_run(source_id)
        if not last:
            return True
        try:
            when = datetime.fromisoformat(last)
        except (ValueError, TypeError):
            return True
        if when.tzinfo is None:
            when = when.replace(tzinfo=timezone.utc)
        return datetime.now(timezone.utc) - when >= timedelta(minutes=every_minutes)

    def get_redirect(self, token):
        try:
            doc = self.db.redirect_cache.find_one({"_id": mention_id(token)})
            return doc["resolved"] if doc else None
        except Exception:
            return None

    def put_redirect(self, token, resolved):
        try:
            self.db.redirect_cache.update_one(
                {"_id": mention_id(token)},
                {"$set": {"token": token, "resolved": resolved,
                          "resolved_at": datetime.now(timezone.utc).isoformat()}},
                upsert=True)
        except Exception:
            pass

    def flush(self):
        pass

    def close(self):
        try:
            self.client.close()
        except Exception:
            pass


import sqlite3

class SQLiteStore:
    """Persistent local SQLite store used when MongoDB Atlas is unavailable or unconfigured."""

    def __init__(self, db_path):
        os.makedirs(os.path.dirname(os.path.abspath(db_path)), exist_ok=True)
        self.db_path = db_path
        self._init_db()

    def _get_conn(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self):
        with self._get_conn() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS mentions (
                    id TEXT PRIMARY KEY,
                    title_key TEXT,
                    norm_url TEXT,
                    url TEXT,
                    title TEXT,
                    snippet TEXT,
                    domain TEXT,
                    platform TEXT,
                    source_id TEXT,
                    engine TEXT,
                    query TEXT,
                    published TEXT,
                    first_seen TEXT,
                    date_status TEXT DEFAULT 'unknown',
                    notified INTEGER DEFAULT 0
                )
            """)
            try:
                conn.execute("ALTER TABLE mentions ADD COLUMN date_status TEXT DEFAULT 'unknown'")
            except Exception:
                pass
            conn.execute("CREATE INDEX IF NOT EXISTS idx_first_seen ON mentions(first_seen)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_platform ON mentions(platform)")

            conn.execute("""
                CREATE TABLE IF NOT EXISTS runs (
                    source_id TEXT PRIMARY KEY,
                    last_run TEXT
                )
            """)

            conn.execute("""
                CREATE TABLE IF NOT EXISTS redirect_cache (
                    id TEXT PRIMARY KEY,
                    token TEXT,
                    resolved TEXT,
                    resolved_at TEXT
                )
            """)

    def seen(self, mid, tkey):
        with self._get_conn() as conn:
            row = conn.execute("SELECT 1 FROM mentions WHERE id = ?", (mid,)).fetchone()
            if row:
                return True
            if tkey:
                row2 = conn.execute("SELECT 1 FROM mentions WHERE title_key = ?", (tkey,)).fetchone()
                if row2:
                    return True
        return False

    def add(self, row):
        with self._get_conn() as conn:
            conn.execute("""
                INSERT OR IGNORE INTO mentions
                (id, title_key, norm_url, url, title, snippet, domain, platform, source_id, engine, query, published, first_seen, date_status, notified)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
            """, (
                row.get("id"), row.get("title_key"), row.get("norm_url"), row.get("url"),
                row.get("title"), row.get("snippet"), row.get("domain"), row.get("platform"),
                row.get("source_id"), row.get("engine"), row.get("query"), row.get("published"),
                row.get("first_seen"), row.get("date_status", "unknown")
            ))

    def pending(self):
        with self._get_conn() as conn:
            rows = conn.execute("SELECT * FROM mentions WHERE notified = 0 ORDER BY first_seen DESC").fetchall()
            return [dict(r) for r in rows]

    def mark_notified(self, ids):
        if not ids:
            return
        with self._get_conn() as conn:
            q = ",".join("?" * len(ids))
            conn.execute(f"UPDATE mentions SET notified = 1 WHERE id IN ({q})", list(ids))

    def since(self, iso):
        with self._get_conn() as conn:
            rows = conn.execute("SELECT * FROM mentions WHERE first_seen >= ? ORDER BY first_seen DESC", (iso,)).fetchall()
            return [dict(r) for r in rows]

    def all_mentions(self, platform=None, query=None, limit=2000):
        sql = "SELECT * FROM mentions"
        params = []
        where = []
        if platform and platform != "All":
            where.append("platform = ?")
            params.append(platform)
        if query:
            where.append("(title LIKE ? OR snippet LIKE ? OR domain LIKE ?)")
            q_param = f"%{query}%"
            params.extend([q_param, q_param, q_param])
        if where:
            sql += " WHERE " + " AND ".join(where)
        sql += " ORDER BY first_seen DESC LIMIT ?"
        params.append(limit)

        with self._get_conn() as conn:
            rows = conn.execute(sql, params).fetchall()
            return [dict(r) for r in rows]

    def platform_counts(self):
        with self._get_conn() as conn:
            rows = conn.execute("SELECT platform, COUNT(*) as n FROM mentions GROUP BY platform").fetchall()
            out = {}
            for r in rows:
                p = r["platform"] or "Web"
                out[p] = r["n"]
            return out

    def total(self):
        with self._get_conn() as conn:
            row = conn.execute("SELECT COUNT(*) as n FROM mentions").fetchone()
            return row["n"] if row else 0

    def backfill_platforms(self):
        return 0

    def last_run(self, source_id):
        with self._get_conn() as conn:
            row = conn.execute("SELECT last_run FROM runs WHERE source_id = ?", (source_id,)).fetchone()
            return row["last_run"] if row else None

    def set_last_run(self, source_id):
        now = datetime.now(timezone.utc).isoformat()
        with self._get_conn() as conn:
            conn.execute("INSERT OR REPLACE INTO runs (source_id, last_run) VALUES (?, ?)", (source_id, now))

    def is_due(self, source_id, every_minutes, force=False):
        if force:
            return True
        last = self.last_run(source_id)
        if not last:
            return True
        try:
            when = datetime.fromisoformat(last)
        except (ValueError, TypeError):
            return True
        if when.tzinfo is None:
            when = when.replace(tzinfo=timezone.utc)
        return datetime.now(timezone.utc) - when >= timedelta(minutes=every_minutes)

    def get_redirect(self, token):
        mid = mention_id(token)
        with self._get_conn() as conn:
            row = conn.execute("SELECT resolved FROM redirect_cache WHERE id = ?", (mid,)).fetchone()
            return row["resolved"] if row else None

    def put_redirect(self, token, resolved):
        mid = mention_id(token)
        now = datetime.now(timezone.utc).isoformat()
        with self._get_conn() as conn:
            conn.execute("INSERT OR REPLACE INTO redirect_cache (id, token, resolved, resolved_at) VALUES (?, ?, ?, ?)", (mid, token, resolved, now))

    def flush(self):
        pass

    def close(self):
        pass


class DummyStore:
    def __init__(self):
        self._mentions = []
        self._runs = {}
        self._redirects = {}

    def seen(self, mid, tkey):
        return any(m["id"] == mid or (tkey and m.get("title_key") == tkey) for m in self._mentions)

    def add(self, row):
        doc = dict(row)
        doc["notified"] = 0
        self._mentions.insert(0, doc)

    def pending(self):
        return [m for m in self._mentions if m.get("notified") == 0]

    def mark_notified(self, ids):
        id_set = set(ids)
        for m in self._mentions:
            if m["id"] in id_set:
                m["notified"] = 1

    def since(self, iso):
        return [m for m in self._mentions if m.get("first_seen", "") >= iso]

    def all_mentions(self, platform=None, query=None, limit=2000):
        res = self._mentions
        if platform and platform != "All":
            res = [m for m in res if m.get("platform") == platform]
        if query:
            q = query.lower()
            res = [m for m in res if q in m.get("title", "").lower() or q in m.get("snippet", "").lower() or q in m.get("domain", "").lower()]
        return res[:limit]

    def platform_counts(self):
        counts = {}
        for m in self._mentions:
            p = m.get("platform") or "Web"
            counts[p] = counts.get(p, 0) + 1
        return counts

    def total(self):
        return len(self._mentions)

    def backfill_platforms(self):
        return 0

    def last_run(self, source_id):
        return self._runs.get(source_id)

    def set_last_run(self, source_id):
        self._runs[source_id] = datetime.now(timezone.utc).isoformat()

    def is_due(self, source_id, every_minutes, force=False):
        return True

    def get_redirect(self, token):
        return self._redirects.get(token)

    def put_redirect(self, token, resolved):
        self._redirects[token] = resolved

    def flush(self):
        pass

    def close(self):
        pass


def make_store(env):
    uri = env.get("MONGODB_URI")
    if uri and uri.strip():
        name = env.get("MONGODB_DB") or "brandmonitor"
        try:
            store = Store(uri, name)
            store.client.admin.command("ping")
            log("storage: MongoDB '%s'" % name)
            return store
        except Exception as err:
            log("Notice: MongoDB Atlas connection failed (%s)." % str(err)[:70])
            log("To use MongoDB Atlas, whitelist your IP in Atlas > Network Access.")

    db_path = env.get("DB_PATH") or os.path.join(BACKEND_ROOT, "data", "google_mentions.db")
    log("storage: Local SQLite database '%s'" % db_path)
    return SQLiteStore(db_path)


def normalize_url(url):
    try:
        parts = urllib.parse.urlsplit(url.strip())
    except ValueError:
        return url.strip().lower()

    host = (parts.netloc or "").lower().split(":")[0]
    if host.startswith("www."):
        host = host[4:]

    kept = [(k, v) for k, v
            in urllib.parse.parse_qsl(parts.query, keep_blank_values=False)
            if not _is_tracking_param(k)]
    kept.sort()
    query = urllib.parse.urlencode(kept)

    path = parts.path or "/"
    if len(path) > 1 and path.endswith("/"):
        path = path.rstrip("/")
    if path.endswith("/index.html") or path.endswith("/index.php"):
        path = path.rsplit("/", 1)[0]

    return urllib.parse.urlunsplit(("https", host, path, query, ""))


def is_redirect_url(url):
    try:
        parts = urllib.parse.urlsplit(url)
        return bool(REDIRECT_HOSTS.match(parts.netloc + parts.path))
    except ValueError:
        return False


def resolve_redirect(url, store, timeout=15):
    if not is_redirect_url(url):
        return url

    cached = store.get_redirect(url)
    if cached:
        return cached

    resolved = None
    try:
        qs = urllib.parse.parse_qs(urllib.parse.urlsplit(url).query)
        for key in ("url", "q"):
            val = (qs.get(key) or [""])[0]
            if val.startswith("http"):
                resolved = val
                break
    except ValueError:
        pass

    if not resolved:
        hop = url
        try:
            for _ in range(5):
                req = urllib.request.Request(hop, headers={"User-Agent": UA})
                try:
                    with _NO_REDIRECT.open(req, timeout=timeout) as resp:
                        location = resp.headers.get("Location")
                        code = resp.status
                except urllib.error.HTTPError as exc:
                    location = exc.headers.get("Location")
                    code = exc.code
                    exc.close()
                if not (300 <= code < 400 and location):
                    break
                hop = urllib.parse.urljoin(hop, location)
                if not is_redirect_url(hop):
                    resolved = hop
                    break
        except Exception as exc:
            return url

    if not resolved or is_redirect_url(resolved):
        return url

    store.put_redirect(url, resolved)
    return resolved


def title_key(title, published=""):
    slug = re.sub(r"[^a-z0-9]+", "", (title or "").lower())
    if len(slug) < 12:
        return None
    return hashlib.sha256(slug.encode("utf-8")).hexdigest()[:32]


def domain_of(url):
    try:
        host = urllib.parse.urlsplit(url).netloc.lower().split(":")[0]
        return host[4:] if host.startswith("www.") else host
    except ValueError:
        return ""


def mention_id(norm_url):
    return hashlib.sha256(norm_url.encode("utf-8")).hexdigest()[:32]


def extract_date_from_html(html_str):
    if not html_str:
        return ""
    # 1. JSON-LD datePublished / dateCreated / publishedDate
    m = re.search(r'"(?:datePublished|publishedDate|dateCreated)"\s*:\s*"([^"]+)"', html_str, re.I)
    if m:
        return m.group(1).strip()
    # 2. Meta article:published_time or og:published_time or pubdate or date
    m = re.search(r'<meta\s+[^>]*(?:property|name)=["\'](?:article:published_time|og:published_time|pubdate|publishdate|date|sailthru\.date|parsely-pub-date|DC\.date\.issued)["\'][^>]*content=["\']([^"\']+)["\']', html_str, re.I)
    if m:
        return m.group(1).strip()
    m = re.search(r'<meta\s+[^>]*content=["\']([^"\']+)["\'][^>]*(?:property|name)=["\'](?:article:published_time|og:published_time|pubdate|publishdate|date|sailthru\.date|parsely-pub-date|DC\.date\.issued)["\']', html_str, re.I)
    if m:
        return m.group(1).strip()
    # 3. HTML5 <time datetime="...">
    m = re.search(r'<time[^>]+datetime=["\']([^"\']+)["\']', html_str, re.I)
    if m:
        return m.group(1).strip()
    return ""


def extract_content(url, fallback_snippet=""):
    """Pull readable text and real publish date from result URL using trafilatura (Open Graph tags, JSON-LD, etc.) or HTTP fallback."""
    extracted_date = ""
    downloaded = None
    if trafilatura is not None:
        try:
            downloaded = trafilatura.fetch_url(url)
            if downloaded:
                try:
                    meta = trafilatura.extract_metadata(downloaded)
                    if meta and meta.date:
                        extracted_date = str(meta.date).strip()
                except Exception:
                    pass
                if not extracted_date:
                    extracted_date = extract_date_from_html(downloaded)
                text = trafilatura.extract(downloaded) or ""
                text = text.strip()
                return (text[:6000] if text else fallback_snippet), extracted_date
        except Exception as exc:
            log("Content extraction notice for %s: %s" % (url, exc))

    if not downloaded:
        # Fallback lightweight fetch for date if trafilatura failed or is unavailable
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=8) as resp:
                raw_html = resp.read().decode("utf-8", "replace")[:100000]
                extracted_date = extract_date_from_html(raw_html)
        except Exception:
            pass

    return fallback_snippet, extracted_date


class SerperDevApi:
    """Serper.dev SERP API Client."""
    def __init__(self, api_key, timeout=30, max_retries=3, delay=0.5):
        self.api_key = api_key
        self.timeout = timeout
        self.max_retries = max_retries
        self.delay = delay
        self.calls = 0
        self.quota_exhausted = False

    def search(self, engine, query, page=1, extra=None):
        endpoint = SERPER_NEWS_URL if engine == "google_news" else SERPER_SEARCH_URL
        payload = {"q": query, "num": 10}
        if page > 1:
            payload["page"] = page
        if extra and isinstance(extra, dict):
            if "gl" in extra:
                payload["gl"] = extra["gl"]
            if "hl" in extra:
                payload["hl"] = extra["hl"]

        data_bytes = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            endpoint,
            data=data_bytes,
            headers={
                "X-API-KEY": self.api_key,
                "Content-Type": "application/json",
                "User-Agent": UA,
            },
            method="POST"
        )

        last_err = None
        for attempt in range(1, self.max_retries + 1):
            try:
                time.sleep(self.delay)
                with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                    self.calls += 1
                    return json.loads(resp.read().decode("utf-8"))
            except urllib.error.HTTPError as exc:
                body = ""
                try:
                    body = exc.read().decode("utf-8", "replace")[:300]
                except Exception:
                    pass
                last_err = "HTTP %s %s" % (exc.code, body)
                if exc.code in (401, 403):
                    die("Serper API rejected key (HTTP %s): %s" % (exc.code, body))
                if exc.code == 429:
                    self.quota_exhausted = True
                    raise QuotaError(body)
                if 400 <= exc.code < 500:
                    break
            except Exception as exc:
                last_err = str(exc)
            if attempt < self.max_retries:
                time.sleep(1.5 ** attempt)

        log("  request failed (%s / %s): %s" % (engine, query, last_err))
        return None


# Backward-compatibility alias
SearchApi = SerperDevApi


def extract_results(engine, payload):
    if not payload:
        return []

    # Serper.dev returns 'organic' for web, 'news' for google_news, 'videos' for youtube
    raw_list = (
        payload.get("organic") or
        payload.get("news") or
        payload.get("videos") or
        payload.get("organic_results") or
        []
    )
    out = []
    for it in raw_list:
        link = it.get("link") or it.get("url")
        if not link:
            continue
        snippet = it.get("snippet") or it.get("description") or ""
        raw_date = it.get("date") or it.get("published_time") or it.get("iso_date") or it.get("publishedDate") or ""
        date_status = "unknown"
        if raw_date:
            if re.search(r"\b(?:\d+)\s+(?:second|minute|hour|day|week|month|year)s?\s+ago\b", raw_date, re.I):
                date_status = "estimated"
            else:
                date_status = "confirmed"
        elif snippet:
            m_date = re.match(r"^([A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})\s*[—\-–\.]", snippet)
            if m_date:
                raw_date = m_date.group(1).strip()
                date_status = "confirmed"
            else:
                m_rel = re.match(r"^(\d+\s+(?:second|minute|hour|day|week|month|year)s?\s+ago)\s*[—\-–\.]", snippet, re.I)
                if m_rel:
                    raw_date = m_rel.group(1).strip()
                    date_status = "estimated"

        out.append({
            "url": link,
            "title": it.get("title") or "(no title)",
            "snippet": snippet[:1000],
            "published": raw_date,
            "date_status": date_status,
            "extra": it.get("source"),
        })
    return out


def build_filter(cfg, brand_name_override=None):
    brand = cfg["brand"]
    filters = cfg.get("filters", {})
    own = [d.lower().replace("www.", "", 1) for d in brand.get("own_domains", [])]
    excluded = [d.lower() for d in filters.get("exclude_domains", [])]
    bad_title = [t.lower() for t in filters.get("exclude_title_terms", [])]
    require_brand = filters.get("require_brand_in_text", False)

    target_name = brand_name_override or brand.get("name", "")
    needle = re.sub(r"[^a-z0-9]+", "", target_name.lower())

    def reject(result):
        url = result.get("url") or ""
        dom = domain_of(url)
        if not dom:
            return "no domain"
        if any(dom == o or dom.endswith("." + o) for o in own):
            return "own domain"
        low_url = url.lower()
        for pattern in excluded:
            if "/" in pattern:
                if pattern in low_url:
                    return "excluded (%s)" % pattern
            elif dom == pattern or dom.endswith("." + pattern):
                return "excluded (%s)" % pattern
        title = (result.get("title") or "").lower()
        for term in bad_title:
            if term in title:
                return "title term (%s)" % term
        if require_brand and needle:
            blob = (result.get("title") or "") + " " + (result.get("snippet") or "")
            if needle not in re.sub(r"[^a-z0-9]+", "", blob.lower()):
                return "brand not in text"
        return None

    return reject


def collect(cfg, api, store, force=True, dry_run=False, keyword_override=None, engine_override=None, on_mention=None):
    reject = build_filter(cfg, brand_name_override=keyword_override)
    default_queries = [keyword_override] if keyword_override else cfg["brand"]["queries"]
    now = datetime.now(timezone.utc).isoformat()
    new_rows = []
    seen_this_run = set()
    stats = {"seen": 0, "filtered": 0, "dupe": 0, "new": 0, "resolved": 0}

    sources = cfg.get("sources", [])
    if engine_override and engine_override != "all":
        sources = [s for s in sources if s.get("engine") == engine_override or s.get("id") == engine_override]
        if not sources:
            sources = [{"id": engine_override, "engine": engine_override, "enabled": True, "pages": 1, "params": {"gl": "us", "hl": "en"}}]

    for source in sources:
        if not source.get("enabled", True):
            continue
        sid = source["id"]
        engine = source["engine"]
        pages = max(1, int(source.get("pages", 1)))
        queries = default_queries if keyword_override else (source.get("queries") or default_queries)

        log("%s (%s): %d queries x %d page(s)" % (sid, engine, len(queries), pages))

        for query in queries:
            for page in range(1, pages + 1):
                payload = api.search(engine, query, page=page, extra=source.get("params"))
                results = extract_results(engine, payload)
                stats["seen"] += len(results)

                for res in results:
                    if is_redirect_url(res["url"]):
                        real = resolve_redirect(res["url"], store)
                        if real != res["url"]:
                            res["url"] = real
                            stats["resolved"] += 1

                    if reject(res):
                        stats["filtered"] += 1
                        continue

                    norm = normalize_url(res["url"])
                    mid = mention_id(norm)
                    tkey = title_key(res.get("title"))

                    if mid in seen_this_run or (tkey and tkey in seen_this_run):
                        stats["dupe"] += 1
                        continue

                    if store.seen(mid, tkey):
                        stats["dupe"] += 1
                        continue

                    # Wire in extract_content as fallback whenever Serper doesn't return a date
                    pub_date = res.get("published") or ""
                    date_status = res.get("date_status") or "unknown"
                    if not pub_date:
                        try:
                            _, fetched_date = extract_content(res["url"], res.get("snippet", ""))
                            if fetched_date:
                                pub_date = fetched_date
                                date_status = "confirmed"
                        except Exception:
                            pass

                    seen_this_run.add(mid)
                    if tkey:
                        seen_this_run.add(tkey)

                    row = {
                        "id": mid,
                        "title_key": tkey,
                        "norm_url": norm,
                        "url": res["url"],
                        "title": res.get("title") or "(no title)",
                        "snippet": res.get("snippet") or "",
                        "domain": domain_of(res["url"]),
                        "platform": platform_of(domain_of(res["url"]), sid),
                        "source_id": sid,
                        "engine": engine,
                        "query": query,
                        "published": pub_date,
                        "first_seen": now,
                        "date_status": date_status,
                    }
                    if not dry_run:
                        store.add(row)
                    if on_mention:
                        on_mention(row)
                    new_rows.append(row)
                    stats["new"] += 1

                if len(results) < 8:
                    break

        if not dry_run:
            store.flush()
            store.set_last_run(sid)

    store.flush()

    log("results %d | redirects %d | filtered %d | already seen %d | NEW %d | api calls %d"
        % (stats["seen"], stats["resolved"], stats["filtered"], stats["dupe"], stats["new"], api.calls))
    return new_rows


def main():
    parser = argparse.ArgumentParser(description="Google Scraper CLI")
    parser.add_argument("--action", type=str, default="scan", choices=["scan", "mentions", "stats"], help="Action to run")
    parser.add_argument("--keyword", type=str, help="Keyword query to search")
    parser.add_argument("--engine", type=str, default="all", help="Engine to search (google, google_news, bing, youtube, all)")
    parser.add_argument("--platform", type=str, default="All", help="Platform filter")
    parser.add_argument("--query", type=str, default="", help="Search query filter")
    parser.add_argument("--limit", type=int, default=2000, help="Mentions limit")
    parser.add_argument("--dry-run", action="store_true", help="Search without persisting")
    parser.add_argument("--json", action="store_true", help="Output JSON results to stdout")
    args = parser.parse_args()

    env = load_env()
    cfg = load_config()
    store = make_store(env)

    try:
        if args.action == "mentions":
            mentions = store.all_mentions(platform=args.platform, query=args.query, limit=args.limit)
            counts = store.platform_counts()
            total = store.total()
            out = {
                "brand": cfg.get("brand", {}).get("name", "Brand Monitor"),
                "total": total,
                "shown": len(mentions),
                "counts": counts,
                "mentions": mentions
            }
            print(json.dumps(out))
            return

        if args.action == "stats":
            out = {
                "total": store.total(),
                "counts": store.platform_counts()
            }
            print(json.dumps(out))
            return

        # Action: scan
        key = env.get("SERPER_API_KEY") or env.get("SEARCHAPI_KEY")
        if not key:
            die("SERPER_API_KEY missing in .env")

        api_cfg = cfg.get("api", {})
        api = SerperDevApi(key,
                           timeout=api_cfg.get("timeout_seconds", 30),
                           max_retries=api_cfg.get("max_retries", 3),
                           delay=api_cfg.get("delay_between_calls_seconds", 0.5))

        new_items = collect(cfg, api, store, force=True, dry_run=args.dry_run,
                            keyword_override=args.keyword, engine_override=args.engine)
        if args.json:
            print(json.dumps(new_items))
    except QuotaError as exc:
        die("SearchApi quota exhausted: %s" % exc)
    finally:
        store.close()


if __name__ == "__main__":
    main()
