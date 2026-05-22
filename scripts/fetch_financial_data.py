"""
台灣股票季度財務資料爬蟲 — 公開資訊觀測站 (MOPS)

從 MOPS 抓取每股盈餘 (EPS)、每股淨值、其他綜合損益等欄位，
並 upsert 至 stock_analyze API。

Usage:
    python fetch_financial_data.py --symbol 3231 --year 2024
    python fetch_financial_data.py --symbol 3231 --year 2024 --quarter Q1
    python fetch_financial_data.py --symbol 3231 --year 2024 --api-url http://localhost:3000
"""

from __future__ import annotations

import argparse
import logging
import random
import sys
import time
from dataclasses import dataclass, field

import requests

# ─── Logging ─────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

# ─── Constants ────────────────────────────────────────────────────────────────

MOPS_BASE_URL = "https://mops.twse.com.tw"
MOPS_EPS_URL = f"{MOPS_BASE_URL}/mops/web/ajax_t163sb04"
MOPS_EQUITY_URL = f"{MOPS_BASE_URL}/mops/web/ajax_t164sb03"

ROC_YEAR_OFFSET = 1911  # 民國年 = 西元年 - 1911

# MOPS season → quarter mapping (MOPS reports cumulative: S1=Q1, S2=H1, S3=9M, S4=FY)
SEASON_MAP: dict[str, int] = {"Q1": 1, "Q2": 2, "Q3": 3, "Q4": 4}
QUARTER_LABELS = ("Q1", "Q2", "Q3", "Q4")

REQUEST_TIMEOUT = 20  # seconds
MAX_RETRIES = 3
RATE_LIMIT_MIN = 2.0  # seconds
RATE_LIMIT_MAX = 5.0  # seconds

DEFAULT_API_URL = "http://localhost:3000"

# ─── Data classes ─────────────────────────────────────────────────────────────


@dataclass
class QuarterFinancials:
    """季度財務資料（增量值，非累積）。

    Attributes:
        symbol: 股票代碼，例如 "3231"。
        year: 西元年份，例如 2024。
        quarter: 季別，例如 "Q1"。
        eps: 每股盈餘（單季）。
        oci: 每股其他綜合損益（單季）。
        other: 其他（保留欄位，預設 0）。
        dividends: 每股股利（配發為負值）。
        other_equity_items: 每股其他權益項目。
        previous_net_value: 期初每股淨值。
    """

    symbol: str
    year: int
    quarter: str
    eps: float | None = None
    oci: float | None = None
    other: float | None = None
    dividends: float | None = None
    other_equity_items: float | None = None
    previous_net_value: float | None = None


@dataclass
class FetchResult:
    """單次爬取結果摘要。

    Attributes:
        symbol: 股票代碼。
        year: 西元年份。
        succeeded: 成功 upsert 的季別清單。
        skipped: 因資料缺失略過的季別清單。
        failed: 因錯誤失敗的季別清單。
        errors: 各季別的錯誤訊息。
    """

    symbol: str
    year: int
    succeeded: list[str] = field(default_factory=list)
    skipped: list[str] = field(default_factory=list)
    failed: list[str] = field(default_factory=list)
    errors: dict[str, str] = field(default_factory=dict)


# ─── HTTP helpers ─────────────────────────────────────────────────────────────


def _post_mops(
    url: str,
    payload: dict[str, str],
    session: requests.Session,
    retries: int = MAX_RETRIES,
) -> str | None:
    """POST 至 MOPS 並回傳 HTML 文字，失敗時重試。

    Args:
        url: MOPS endpoint URL。
        payload: POST form data。
        session: requests Session 物件（含共用 headers）。
        retries: 剩餘重試次數。

    Returns:
        HTML 文字，或 None（所有重試失敗後）。
    """
    for attempt in range(1, retries + 1):
        try:
            resp = session.post(url, data=payload, timeout=REQUEST_TIMEOUT)
            resp.raise_for_status()
            resp.encoding = "utf-8"
            return resp.text
        except requests.exceptions.Timeout:
            logger.warning("Timeout on attempt %d/%d → %s", attempt, retries, url)
        except requests.exceptions.RequestException as exc:
            logger.warning(
                "Request error on attempt %d/%d: %s", attempt, retries, exc
            )
        if attempt < retries:
            backoff = random.uniform(RATE_LIMIT_MIN, RATE_LIMIT_MAX)
            logger.info("Backing off %.1fs before retry…", backoff)
            time.sleep(backoff)
    return None


def _rate_limit() -> None:
    """隨機延遲 2–5 秒，避免對 MOPS 造成過大請求壓力。"""
    delay = random.uniform(RATE_LIMIT_MIN, RATE_LIMIT_MAX)
    logger.debug("Rate limit sleep: %.2fs", delay)
    time.sleep(delay)


# ─── MOPS parsers ─────────────────────────────────────────────────────────────


def _parse_eps_table(html: str, symbol: str) -> dict[str, float | None]:
    """解析 MOPS EPS 報表 HTML，擷取各季每股盈餘。

    MOPS 綜合損益表為累積值：
      S1 = Q1
      S2 = Q1+Q2 → Q2 = S2 - S1
      S3 = Q1+Q2+Q3 → Q3 = S3 - S2
      S4 = 全年 → Q4 = S4 - S3

    Args:
        html: MOPS ajax 回傳的 HTML 文字。
        symbol: 股票代碼（用於日誌）。

    Returns:
        {'Q1': float|None, 'Q2': float|None, ...} 增量每股盈餘。
    """
    try:
        from html.parser import HTMLParser

        class _TableParser(HTMLParser):
            """Simple state-machine HTML parser for MOPS tabular data."""

            def __init__(self) -> None:
                super().__init__()
                self.in_td = False
                self.rows: list[list[str]] = []
                self._current_row: list[str] = []
                self._current_cell = ""
                self.in_tr = False

            def handle_starttag(self, tag: str, attrs: list) -> None:
                if tag == "tr":
                    self.in_tr = True
                    self._current_row = []
                elif tag == "td":
                    self.in_td = True
                    self._current_cell = ""

            def handle_endtag(self, tag: str) -> None:
                if tag == "td":
                    self._current_row.append(self._current_cell.strip())
                    self.in_td = False
                elif tag == "tr":
                    if self._current_row:
                        self.rows.append(self._current_row)
                    self.in_tr = False

            def handle_data(self, data: str) -> None:
                if self.in_td:
                    self._current_cell += data

        parser = _TableParser()
        parser.feed(html)

        # 尋找包含「基本每股盈餘」或「每股盈餘」的列
        cumulative: dict[int, float | None] = {}
        for row in parser.rows:
            label = row[0] if row else ""
            if "每股盈餘" in label or "基本每股盈餘" in label:
                # 欄位順序: 標籤, S1, S2, S3, S4
                for season_idx, col_idx in enumerate([1, 2, 3, 4], start=1):
                    if col_idx < len(row):
                        try:
                            val = float(row[col_idx].replace(",", ""))
                            cumulative[season_idx] = val
                        except (ValueError, AttributeError):
                            cumulative[season_idx] = None
                break

        # 累積 → 增量
        incremental: dict[str, float | None] = {}
        prev: float | None = None
        for s in range(1, 5):
            q_label = QUARTER_LABELS[s - 1]
            cum = cumulative.get(s)
            if cum is None:
                incremental[q_label] = None
            elif s == 1 or prev is None:
                incremental[q_label] = cum
            else:
                incremental[q_label] = round(cum - prev, 4)
            if cum is not None:
                prev = cum

        return incremental

    except Exception as exc:  # noqa: BLE001
        logger.error("Failed to parse EPS table for %s: %s", symbol, exc)
        return {q: None for q in QUARTER_LABELS}


def _parse_equity_table(
    html: str, symbol: str
) -> dict[str, dict[str, float | None]]:
    """解析 MOPS 股東權益變動表，擷取每股淨值及其他權益項目。

    Args:
        html: MOPS ajax 回傳的 HTML 文字。
        symbol: 股票代碼（用於日誌）。

    Returns:
        {'Q1': {'net_value': float|None, 'oci': float|None,
                'other_equity': float|None}, ...}
    """
    # MOPS 資產負債表為各季末值（非累積）
    result: dict[str, dict[str, float | None]] = {
        q: {"net_value": None, "oci": None, "other_equity": None}
        for q in QUARTER_LABELS
    }
    try:
        from html.parser import HTMLParser

        class _EqParser(HTMLParser):
            def __init__(self) -> None:
                super().__init__()
                self.rows: list[list[str]] = []
                self._current_row: list[str] = []
                self._current_cell = ""
                self.in_td = False

            def handle_starttag(self, tag: str, attrs: list) -> None:
                if tag == "tr":
                    self._current_row = []
                elif tag == "td":
                    self.in_td = True
                    self._current_cell = ""

            def handle_endtag(self, tag: str) -> None:
                if tag == "td":
                    self._current_row.append(self._current_cell.strip())
                    self.in_td = False
                elif tag == "tr" and self._current_row:
                    self.rows.append(self._current_row)

            def handle_data(self, data: str) -> None:
                if self.in_td:
                    self._current_cell += data

        parser = _EqParser()
        parser.feed(html)

        def _extract(rows: list[list[str]], keyword: str) -> dict[int, float | None]:
            """從表格列中，找含關鍵字的列並擷取 S1-S4 值。"""
            out: dict[int, float | None] = {}
            for row in rows:
                if not row:
                    continue
                if keyword in row[0]:
                    for s, ci in enumerate([1, 2, 3, 4], start=1):
                        if ci < len(row):
                            try:
                                out[s] = float(row[ci].replace(",", ""))
                            except (ValueError, AttributeError):
                                out[s] = None
                    break
            return out

        nv_map = _extract(parser.rows, "每股淨值")
        oci_map = _extract(parser.rows, "其他綜合損益")
        oeq_map = _extract(parser.rows, "其他權益")

        for s in range(1, 5):
            q = QUARTER_LABELS[s - 1]
            result[q]["net_value"] = nv_map.get(s)
            result[q]["oci"] = oci_map.get(s)
            result[q]["other_equity"] = oeq_map.get(s)

    except Exception as exc:  # noqa: BLE001
        logger.error("Failed to parse equity table for %s: %s", symbol, exc)

    return result


# ─── Core scraper ─────────────────────────────────────────────────────────────


class MOPSScraper:
    """公開資訊觀測站財務資料爬蟲。

    Attributes:
        api_url: stock_analyze API base URL。
        session: 共用 requests Session。
    """

    def __init__(self, api_url: str = DEFAULT_API_URL) -> None:
        """初始化爬蟲。

        Args:
            api_url: stock_analyze API base URL，例如 "http://localhost:3000"。
        """
        self.api_url = api_url.rstrip("/")
        self.session = requests.Session()
        self.session.headers.update(
            {
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/124.0.0.0 Safari/537.36"
                ),
                "Accept-Language": "zh-TW,zh;q=0.9",
                "Referer": MOPS_BASE_URL,
            }
        )

    # ── MOPS fetching ──────────────────────────────────────────────────────

    def fetch_eps_year(
        self, symbol: str, year: int
    ) -> dict[str, float | None]:
        """從 MOPS 抓取指定股票、年度的四季每股盈餘（增量）。

        Args:
            symbol: 股票代碼，例如 "3231"。
            year: 西元年份，例如 2024。

        Returns:
            {'Q1': float|None, 'Q2': float|None, 'Q3': float|None, 'Q4': float|None}
        """
        roc_year = year - ROC_YEAR_OFFSET
        payload = {
            "encodeURIComponent": "1",
            "step": "1",
            "firstin": "1",
            "off": "1",
            "co_id": symbol,
            "year": str(roc_year),
            "season": "04",  # 請求全年報告（含 S1-S4）
        }
        logger.info("Fetching EPS for %s %d (ROC %d)…", symbol, year, roc_year)
        html = _post_mops(MOPS_EPS_URL, payload, self.session)
        if html is None:
            logger.error("Failed to fetch EPS data for %s %d", symbol, year)
            return {q: None for q in QUARTER_LABELS}
        _rate_limit()
        return _parse_eps_table(html, symbol)

    def fetch_equity_year(
        self, symbol: str, year: int
    ) -> dict[str, dict[str, float | None]]:
        """從 MOPS 抓取指定股票、年度各季末每股淨值與其他權益。

        Args:
            symbol: 股票代碼，例如 "3231"。
            year: 西元年份，例如 2024。

        Returns:
            {'Q1': {'net_value': float|None, 'oci': float|None, ...}, ...}
        """
        roc_year = year - ROC_YEAR_OFFSET
        payload = {
            "encodeURIComponent": "1",
            "step": "1",
            "firstin": "1",
            "off": "1",
            "co_id": symbol,
            "year": str(roc_year),
            "season": "04",
        }
        logger.info(
            "Fetching equity data for %s %d (ROC %d)…", symbol, year, roc_year
        )
        html = _post_mops(MOPS_EQUITY_URL, payload, self.session)
        if html is None:
            logger.error("Failed to fetch equity data for %s %d", symbol, year)
            return {
                q: {"net_value": None, "oci": None, "other_equity": None}
                for q in QUARTER_LABELS
            }
        _rate_limit()
        return _parse_equity_table(html, symbol)

    # ── API upsert ─────────────────────────────────────────────────────────

    def _get_stock_id(self, symbol: str) -> str | None:
        """查詢股票在 API 中的內部 ID。

        Args:
            symbol: 股票代碼，例如 "3231"。

        Returns:
            stock UUID，或 None（找不到時）。
        """
        try:
            resp = self.session.get(
                f"{self.api_url}/api/stocks/{symbol}",
                timeout=REQUEST_TIMEOUT,
            )
            if resp.status_code == 404:
                logger.error("Stock %s not found in API. Create it first.", symbol)
                return None
            resp.raise_for_status()
            data: dict = resp.json()
            return str(data["id"])
        except requests.exceptions.RequestException as exc:
            logger.error("Failed to get stock ID for %s: %s", symbol, exc)
            return None

    def upsert_quarter(
        self, stock_id: str, data: QuarterFinancials
    ) -> bool:
        """PUT 單季財務資料至 API。

        Args:
            stock_id: 股票內部 UUID。
            data: 季度財務資料物件。

        Returns:
            True 表示成功，False 表示失敗。
        """
        url = (
            f"{self.api_url}/api/financials/{stock_id}"
            f"/{data.year}/{data.quarter}"
        )
        body = {
            k: v
            for k, v in {
                "eps": data.eps,
                "oci": data.oci,
                "other": data.other,
                "dividends": data.dividends,
                "otherEquityItems": data.other_equity_items,
                "previousNetValue": data.previous_net_value,
            }.items()
            if v is not None
        }
        if not body:
            logger.info("Skipping %s %d-%s: no data to upsert", data.symbol, data.year, data.quarter)
            return False
        try:
            resp = self.session.put(url, json=body, timeout=REQUEST_TIMEOUT)
            resp.raise_for_status()
            logger.info(
                "Upserted %s %d-%s: %s",
                data.symbol,
                data.year,
                data.quarter,
                list(body.keys()),
            )
            return True
        except requests.exceptions.RequestException as exc:
            logger.error(
                "Failed to upsert %s %d-%s: %s",
                data.symbol,
                data.year,
                data.quarter,
                exc,
            )
            return False

    def propagate(self, stock_id: str) -> int:
        """呼叫 propagate endpoint，將每年 Q4 淨值帶入次年 Q1 期初淨值。

        Args:
            stock_id: 股票內部 UUID。

        Returns:
            成功傳播的筆數（-1 表示失敗）。
        """
        try:
            resp = self.session.post(
                f"{self.api_url}/api/financials/{stock_id}/propagate",
                timeout=REQUEST_TIMEOUT,
            )
            resp.raise_for_status()
            count: int = resp.json().get("propagated", 0)
            logger.info("Propagated %d cross-year entries for stock %s", count, stock_id)
            return count
        except requests.exceptions.RequestException as exc:
            logger.error("Failed to propagate for stock %s: %s", stock_id, exc)
            return -1

    # ── Orchestration ──────────────────────────────────────────────────────

    def scrape_year(
        self,
        symbol: str,
        year: int,
        quarters: list[str] | None = None,
    ) -> FetchResult:
        """爬取並 upsert 指定股票某年度的季度財務資料。

        Args:
            symbol: 股票代碼，例如 "3231"。
            year: 西元年份，例如 2024。
            quarters: 限制抓取的季別清單，例如 ["Q1", "Q2"]。None 表示全四季。

        Returns:
            FetchResult 摘要物件。
        """
        result = FetchResult(symbol=symbol, year=year)
        target_quarters = quarters or list(QUARTER_LABELS)

        stock_id = self._get_stock_id(symbol)
        if stock_id is None:
            for q in target_quarters:
                result.failed.append(q)
                result.errors[q] = "Stock not found in API"
            return result

        # 抓取全年 EPS（一次 request 取全年）
        eps_map = self.fetch_eps_year(symbol, year)

        # 抓取全年股東權益資料（季末淨值、OCI、其他權益）
        equity_map = self.fetch_equity_year(symbol, year)

        for q in target_quarters:
            eps = eps_map.get(q)
            eq = equity_map.get(q, {})
            oci = eq.get("oci")
            other_equity = eq.get("other_equity")

            # Q1 previous_net_value = 上年 Q4 末淨值（由 propagate 補填，此處略過）
            # Q2/Q3/Q4 previous_net_value = 前季末淨值（由 gridStore cascade 計算）
            # 故此處只寫入 eps、oci、other_equity_items；淨值由公式引擎衍生

            if eps is None and oci is None and other_equity is None:
                logger.warning(
                    "No data available for %s %d-%s, skipping.", symbol, year, q
                )
                result.skipped.append(q)
                continue

            data = QuarterFinancials(
                symbol=symbol,
                year=year,
                quarter=q,
                eps=eps,
                oci=oci,
                other_equity_items=other_equity,
            )
            success = self.upsert_quarter(stock_id, data)
            if success:
                result.succeeded.append(q)
            else:
                result.failed.append(q)
                result.errors[q] = "API upsert failed"

            _rate_limit()

        # 跨年級聯
        if result.succeeded:
            self.propagate(stock_id)

        return result


# ─── CLI ──────────────────────────────────────────────────────────────────────


def _parse_args() -> argparse.Namespace:
    """解析命令列參數。

    Returns:
        Parsed Namespace 物件。
    """
    parser = argparse.ArgumentParser(
        description="從公開資訊觀測站 (MOPS) 抓取台灣股票季度財務資料",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
範例:
  python fetch_financial_data.py --symbol 3231 --year 2024
  python fetch_financial_data.py --symbol 2330 --year 2023 --quarter Q3
  python fetch_financial_data.py --symbol 3231 --year 2024 --api-url https://your-app.vercel.app
""",
    )
    parser.add_argument(
        "--symbol",
        required=True,
        help="股票代碼，例如 3231",
    )
    parser.add_argument(
        "--year",
        required=True,
        type=int,
        help="西元年份，例如 2024",
    )
    parser.add_argument(
        "--quarter",
        choices=["Q1", "Q2", "Q3", "Q4"],
        default=None,
        help="指定單季（預設抓全年四季）",
    )
    parser.add_argument(
        "--api-url",
        default=DEFAULT_API_URL,
        help=f"stock_analyze API base URL（預設: {DEFAULT_API_URL}）",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="顯示 DEBUG 級別日誌",
    )
    return parser.parse_args()


def main() -> None:
    """CLI entrypoint。"""
    args = _parse_args()

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    scraper = MOPSScraper(api_url=args.api_url)
    quarters = [args.quarter] if args.quarter else None

    logger.info(
        "Starting scrape: symbol=%s year=%d quarters=%s api=%s",
        args.symbol,
        args.year,
        quarters or "Q1-Q4",
        args.api_url,
    )

    result = scraper.scrape_year(
        symbol=args.symbol,
        year=args.year,
        quarters=quarters,
    )

    print("\n─── 爬取結果摘要 ───────────────────────────────")
    print(f"股票: {result.symbol}  年度: {result.year}")
    print(f"成功: {result.succeeded or '(無)'}")
    print(f"略過: {result.skipped or '(無)'}")
    print(f"失敗: {result.failed or '(無)'}")
    if result.errors:
        print("錯誤:")
        for q, err in result.errors.items():
            print(f"  {q}: {err}")
    print("─────────────────────────────────────────────")

    if result.failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
