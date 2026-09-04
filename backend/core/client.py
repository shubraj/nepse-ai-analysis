"""Company list from nepsealpha, detail from merolagani."""

import json
import re
from datetime import datetime
from typing import Any

from curl_cffi import requests
from bs4 import BeautifulSoup

NEPSEALPHA_TRADED_STOCKS_URL = "https://nepsealpha.com/traded-stocks"
NEPSEALPHA_HISTORY_URL = "https://nepsealpha.com/trading/1/history"
# Cloudflare only edge-caches this exact frame value for /trading/1/history;
# any other frame is a cache MISS and gets bot-challenged. Fetch the full
# series at this fixed frame and slice client/server-side as needed.
_HISTORY_FRAME = 1000
_HISTORY_FSK = "ImoDk7zT"


class MerolaganiClient:
    """Company list (nepsealpha) and detail (merolagani) via HTTP."""

    def __init__(
        self,
        base_url: str = "https://www.merolagani.com",
        timeout: int = 30,
        headers: dict[str, str] | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.session = requests.Session()
        self.session.headers.update(
            headers
            or {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.8",
            }
        )

    def request(
        self,
        method: str,
        path: str = "",
        url: str | None = None,
        params: dict[str, Any] | None = None,
        data: dict[str, Any] | None = None,
        json_body: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
        timeout: int | None = None,
        **kwargs: Any,
    ) -> requests.Response:
        request_url = url if url else f"{self.base_url}/{path.lstrip('/')}"
        request_timeout = timeout if timeout is not None else self.timeout
        request_headers = {**(headers or {})}
        if json_body is not None:
            kwargs["json"] = json_body
        response = self.session.request(
            method=method.upper(),
            url=request_url,
            params=params,
            data=data,
            headers=request_headers or None,
            timeout=request_timeout,
            impersonate="chrome",
            **kwargs,
        )
        response.raise_for_status()
        return response

    def get(self, path: str = "", **kwargs: Any) -> requests.Response:
        return self.request("GET", path=path, **kwargs)

    def post(self, path: str = "", **kwargs: Any) -> requests.Response:
        return self.request("POST", path=path, **kwargs)

    def get_company_list(self) -> list[dict[str, str]]:
        """Fetch company list from nepsealpha/traded-stocks."""
        r = self.session.get(
            NEPSEALPHA_TRADED_STOCKS_URL,
            timeout=self.timeout,
            impersonate="chrome",
        )
        r.raise_for_status()
        soup = BeautifulSoup(r.text, "html.parser")
        el = soup.select_one("#nepse_app_content")
        if not el or not el.get("data-page"):
            return []
        data = json.loads(el["data-page"])
        traded_stocks = data.get("props", {}).get("tradedStocks") or []
        seen: set[str] = set()
        result: list[dict[str, str]] = []
        for item in traded_stocks:
            if not isinstance(item, dict):
                continue
            symbol = (item.get("symbol") or "").strip()
            if not symbol or symbol.upper() in seen:
                continue
            seen.add(symbol.upper())
            stockinfo = item.get("stockinfo") or {}
            name = (stockinfo.get("full_name") or "").strip() or symbol
            sector = (stockinfo.get("sector") or "").strip() or None
            row: dict[str, str] = {"symbol": symbol, "name": name}
            if sector:
                row["sector"] = sector
            result.append(row)
        return result

    def get_price_history(self, symbol: str) -> list[dict[str, Any]]:
        """Daily OHLCV history for a symbol, via nepsealpha's chart datafeed."""
        r = self.session.get(
            NEPSEALPHA_HISTORY_URL,
            params={
                "fsk": _HISTORY_FSK,
                "symbol": symbol.upper(),
                "resolution": "1D",
                "frame": _HISTORY_FRAME,
            },
            timeout=self.timeout,
            impersonate="chrome",
        )
        r.raise_for_status()
        data = r.json()
        if data.get("s") != "ok":
            return []
        t = data.get("t") or []
        o = data.get("o") or []
        h = data.get("h") or []
        l = data.get("l") or []
        c = data.get("c") or []
        v = data.get("v") or []
        n = min(len(t), len(o), len(h), len(l), len(c), len(v))
        out = []
        for i in range(n):
            out.append({
                "date": datetime.utcfromtimestamp(int(t[i])).strftime("%Y-%m-%d"),
                "open": o[i],
                "high": h[i],
                "low": l[i],
                "close": c[i],
                "volume": v[i],
            })
        return out

    def _norm_key(self, label: str) -> str:
        key = label.strip().lower().replace(" ", "_").replace("-", "_").replace("%", "pct")
        key = re.sub(r"_+", "_", key).strip("_")
        return key or label

    def _parse_overview_table(self, soup: BeautifulSoup) -> dict[str, str]:
        out: dict[str, str] = {}
        table = soup.find("table", id="accordion")
        if not table:
            return out
        for tbody in table.find_all("tbody", style=re.compile(r"border:\s*none")):
            if "display: none" in (tbody.get("style") or ""):
                continue
            row = tbody.find("tr")
            if not row or row.get("class") and "panel-collapse" in row.get("class", []):
                continue
            th, td = row.find("th"), row.find("td")
            if not th or not td:
                continue
            label = th.get_text(separator=" ", strip=True)
            if not label:
                continue
            value = td.get_text(separator=" ", strip=True)
            key = self._norm_key(re.sub(r"\s*\(.*?\)\s*$", "", label).strip())
            out[key] = value
        return out

    def _parse_about_table(self, soup: BeautifulSoup) -> dict[str, str]:
        out: dict[str, str] = {}
        div = soup.find("div", id="divAbout")
        if not div:
            return out
        table = div.find("table", class_=re.compile(r"table"))
        if not table:
            return out
        for tr in table.find_all("tr"):
            th, td = tr.find("th"), tr.find("td")
            if not th or not td:
                continue
            label = th.get_text(strip=True)
            key = self._norm_key(label)
            out[key] = td.get_text(strip=True)
        return out

    def _parse_history_table(
        self, soup: BeautifulSoup, panel_id: str, value_fy_columns: tuple[int, int] | None = None
    ) -> list[dict[str, str]]:
        rows: list[dict[str, str]] = []
        panel = soup.find("tr", id=panel_id)
        if not panel:
            return rows
        table = panel.find("table")
        if not table:
            return rows
        tbody = table.find("tbody")
        if not tbody:
            return rows
        trs = tbody.find_all("tr")
        if len(trs) < 2:
            return rows
        for tr in trs[1:]:
            cells = tr.find_all("td")
            if len(cells) < 2:
                continue
            texts = [c.get_text(strip=True) for c in cells]
            if value_fy_columns:
                vi, fi = value_fy_columns
                row = {"value": texts[vi] if vi < len(texts) else "", "fiscal_year": texts[fi] if fi < len(texts) else ""}
            else:
                row = {"#": texts[0] if texts else "", "value": texts[1] if len(texts) > 1 else "", "fiscal_year": texts[2] if len(texts) > 2 else ""}
            rows.append(row)
        return rows

    def get_company_detail(self, symbol: str) -> dict[str, Any]:
        r = self.get("/CompanyDetail.aspx", params={"symbol": symbol})
        r.raise_for_status()
        soup = BeautifulSoup(r.text, "html.parser")
        name_el = soup.find("span", id=re.compile(r"companyName"))
        company_display_name = name_el.get_text(strip=True) if name_el else ""
        overview = self._parse_overview_table(soup)
        about = self._parse_about_table(soup)
        dividend_history = self._parse_history_table(soup, "dividend-panel", value_fy_columns=(1, 2))
        bonus_history = self._parse_history_table(soup, "bonus-panel", value_fy_columns=(1, 2))
        right_share_history = self._parse_history_table(soup, "right-panel", value_fy_columns=(1, 2))
        result: dict[str, Any] = {
            "symbol": symbol.upper(),
            "company_display_name": company_display_name,
            "overview": overview,
            "about": about,
            "dividend_history": dividend_history,
            "bonus_history": bonus_history,
            "right_share_history": right_share_history,
        }
        return result

    def close(self) -> None:
        self.session.close()

    def __enter__(self) -> "MerolaganiClient":
        return self

    def __exit__(self, *args: Any) -> None:
        self.close()