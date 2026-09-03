"""Nepal financial news scraper — Sharesansar + Merolagani."""

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from bs4 import BeautifulSoup
from curl_cffi import requests
from sqlalchemy.orm import Session

from models.news_item import NewsItem

logger = logging.getLogger(__name__)

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

# ---------------------------------------------------------------------------
# Sector keyword mapping — title is lowercased before matching
# ---------------------------------------------------------------------------
_SECTOR_KEYWORDS: dict[str, list[str]] = {
    "banking": [
        "bank", "nabil", "nica", "himalayan", "everest", "kumari", "laxmi",
        "sunrise", "prabhu", "citizens", "century", "siddhartha", "mega",
        "global ime", "sanima", "prime", "ncc", "scb", "nbl",
    ],
    "hydropower": [
        "hydro", "hydropower", "electricity", "nea", "energy", "mw",
        "megawatt", "river", "dam", "power plant", "upper trishuli",
    ],
    "insurance": [
        "insurance", "life insurance", "non-life", "reinsurance",
        "premium", "claim", "beema",
    ],
    "finance": [
        "finance company", "microfinance", "laghubitta", "saccos",
        "credit", "loan", "nMB", "capital",
    ],
    "market": [
        "nepse", "index", "sebon", "bull", "bear", "circuit breaker",
        "trading halt", "ipo", "fpo", "right share", "dividend",
    ],
}

# Macro events that affect all sectors
_MACRO_KEYWORDS = [
    "flood", "earthquake", "landslide", "disaster", "monsoon",
    "political", "government", "budget", "inflation", "interest rate",
    "remittance", "gdp", "economy", "nepal rastra bank", "nrb",
    "liquidity", "forex", "import", "export",
]


def _tag_headline(title: str) -> list[str]:
    lower = title.lower()
    tags: list[str] = []
    for sector, keywords in _SECTOR_KEYWORDS.items():
        if any(kw in lower for kw in keywords):
            tags.append(sector)
    if any(kw in lower for kw in _MACRO_KEYWORDS):
        tags.append("macro")
    return tags or ["general"]


# ---------------------------------------------------------------------------
# Source scrapers
# ---------------------------------------------------------------------------

def _scrape_sharesansar(session: requests.Session) -> list[dict[str, Any]]:
    """Scrape latest news from Sharesansar."""
    results = []
    try:
        resp = session.get(
            "https://www.sharesansar.com/category/latest",
            headers=_HEADERS,
            timeout=20,
        )
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")

        # Primary: Sharesansar uses div.news-list or div.newslist as the container
        container = (
            soup.select_one(".news-list.b-shadow")
            or soup.select_one(".newslist")
            or soup.select_one(".news-list")
        )
        anchors = (
            container.select("a[href*='newsdetail']")
            if container
            else soup.select("a[href*='newsdetail'], a[href*='/news/']")
        )

        seen: set[str] = set()
        for a in anchors:
            href = a.get("href", "")
            text = (a.get("title") or a.get_text(strip=True)).strip()
            if not text or len(text) < 20 or href in seen:
                continue
            seen.add(href)
            url = href if href.startswith("http") else f"https://www.sharesansar.com{href}"
            results.append({
                "title": text,
                "url": url,
                "published_at": datetime.utcnow(),
                "source": "sharesansar",
            })
            if len(results) >= 25:
                break

    except Exception as e:
        logger.warning("Sharesansar scrape failed: %s", e)

    return results


def _scrape_merolagani_news(session: requests.Session) -> list[dict[str, Any]]:
    """Scrape latest news from Merolagani."""
    results = []
    try:
        resp = session.get(
            "https://merolagani.com/NewsList.aspx",
            headers=_HEADERS,
            timeout=20,
        )
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")

        # Merolagani ASP.NET site — news links typically contain /NewsDetail
        anchors = soup.select("a[href*='NewsDetail']") or soup.select("a[href*='/news/']")
        seen: set[str] = set()
        for a in anchors[:40]:
            href = a.get("href", "")
            title = a.get_text(strip=True)
            if not title or len(title) < 15 or href in seen:
                continue
            seen.add(href)
            url = href if href.startswith("http") else f"https://merolagani.com/{href.lstrip('/')}"
            results.append({
                "title": title,
                "url": url,
                "published_at": datetime.utcnow(),
                "source": "merolagani",
            })

    except Exception as e:
        logger.warning("Merolagani news scrape failed: %s", e)

    return results


def _parse_date(raw: str | None) -> datetime:
    if not raw:
        return datetime.utcnow()
    for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%d", "%B %d, %Y", "%d %B %Y"):
        try:
            return datetime.strptime(raw.strip()[:20], fmt)
        except (ValueError, AttributeError):
            continue
    return datetime.utcnow()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

class NewsService:
    def fetch_and_store(self, db: Session) -> int:
        """Scrape all sources, deduplicate, store new items. Returns count of new rows."""
        session = requests.Session()
        all_items = _scrape_sharesansar(session) + _scrape_merolagani_news(session)

        new_count = 0
        for item in all_items:
            url = item["url"]
            exists = db.query(NewsItem).filter(NewsItem.url == url).first()
            if exists:
                continue
            tags = _tag_headline(item["title"])
            row = NewsItem(
                title=item["title"],
                url=url,
                source=item["source"],
                published_at=item["published_at"],
                fetched_at=datetime.utcnow(),
                sector_tags=tags,
            )
            db.add(row)
            new_count += 1

        if new_count:
            db.commit()
        logger.info("News sync: %d new items stored", new_count)
        return new_count

    @staticmethod
    def get_recent_headlines(db: Session, days: int = 7, limit: int = 10) -> list[str]:
        """Return recent headline titles for market prediction prompt."""
        cutoff = datetime.utcnow() - timedelta(days=days)
        rows = (
            db.query(NewsItem)
            .filter(NewsItem.published_at >= cutoff)
            .order_by(NewsItem.published_at.desc())
            .limit(limit)
            .all()
        )
        return [r.title for r in rows]

    @staticmethod
    def get_sector_headlines(db: Session, sector: str | None, days: int = 7, limit: int = 5) -> list[str]:
        """Return headlines tagged for a given sector (or macro events)."""
        cutoff = datetime.utcnow() - timedelta(days=days)
        base_q = db.query(NewsItem).filter(NewsItem.published_at >= cutoff)

        if sector:
            sector_lower = sector.lower()
            # Match sector tag or macro tag
            matching_tag = _match_sector_tag(sector_lower)
            rows = (
                base_q
                .filter(NewsItem.sector_tags.overlap([matching_tag, "macro"]))
                .order_by(NewsItem.published_at.desc())
                .limit(limit)
                .all()
            )
        else:
            rows = (
                base_q
                .filter(NewsItem.sector_tags.overlap(["macro", "market"]))
                .order_by(NewsItem.published_at.desc())
                .limit(limit)
                .all()
            )

        return [r.title for r in rows]


def _match_sector_tag(sector_str: str) -> str:
    """Map a company sector string to a sector_tags value."""
    mapping = {
        "bank": "banking",
        "finance": "finance",
        "hydro": "hydropower",
        "power": "hydropower",
        "insurance": "insurance",
        "microfinance": "finance",
        "development bank": "banking",
    }
    for key, tag in mapping.items():
        if key in sector_str:
            return tag
    return "general"
