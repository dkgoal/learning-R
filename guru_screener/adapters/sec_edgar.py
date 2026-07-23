"""SEC EDGAR adapters: universe, fundamentals (XBRL companyfacts), and 13F.

All endpoints are free and authoritative but rate-limited and quarterly-lagged
(~45 days for 13F). Everything here is written to run live on the user's machine;
it degrades gracefully (returns None / empty) when a filer lacks coverage or the
network is unavailable, so the pipeline can fall back to cache or demo data.

Endpoints used:
* https://www.sec.gov/files/company_tickers.json        (CIK <-> ticker)
* https://data.sec.gov/api/xbrl/companyfacts/CIK##########.json  (fundamentals)
* https://data.sec.gov/submissions/CIK##########.json   (filing index)
* the 13F "information table" XML referenced by each 13F-HR submission
"""
from __future__ import annotations

import re
from typing import Any, Dict, List, Optional
from xml.etree import ElementTree as ET

from ..models import Fundamentals, Holding, SecurityMeta
from .base import FundamentalsAdapter, HoldingsAdapter, UniverseAdapter
from .http import HttpClient

TICKERS_URL = "https://www.sec.gov/files/company_tickers.json"
FACTS_URL = "https://data.sec.gov/api/xbrl/companyfacts/CIK{cik:010d}.json"
SUBMISSIONS_URL = "https://data.sec.gov/submissions/CIK{cik:010d}.json"
ARCHIVE = "https://www.sec.gov/Archives/edgar/data/{cik}/{acc_nodash}/{doc}"


def _pad_cik(cik: str | int) -> int:
    return int(str(cik).lstrip("CIK").lstrip("0") or "0")


class SecUniverseAdapter(UniverseAdapter):
    """Builds the base universe from SEC's ticker reference file."""

    def __init__(self, http: HttpClient):
        self.http = http

    def list_securities(self) -> List[SecurityMeta]:
        data = self.http.get_json(TICKERS_URL)
        out: List[SecurityMeta] = []
        for row in data.values():
            out.append(SecurityMeta(
                ticker=str(row["ticker"]).upper(),
                cik=str(row["cik_str"]),
                name=row.get("title", ""),
            ))
        return out


# --- XBRL fact extraction ---------------------------------------------------

def _latest_fact(facts: Dict[str, Any], keys: List[str],
                 unit_hint: Optional[str] = None) -> Optional[float]:
    """Return the most recent annual value among any of the given XBRL tags."""
    best_val, best_end = None, ""
    for key in keys:
        node = facts.get("us-gaap", {}).get(key) or facts.get("dei", {}).get(key)
        if not node:
            continue
        for unit, points in node.get("units", {}).items():
            if unit_hint and unit_hint not in unit:
                continue
            for p in points:
                if p.get("form") not in ("10-K", "20-F", "10-K/A"):
                    continue
                end = p.get("end", "")
                if end > best_end and p.get("val") is not None:
                    best_end, best_val = end, float(p["val"])
    return best_val


def _annual_series(facts: Dict[str, Any], keys: List[str]) -> List[float]:
    """Return annual values oldest->newest for the first matching tag."""
    for key in keys:
        node = facts.get("us-gaap", {}).get(key)
        if not node:
            continue
        vals: Dict[str, float] = {}
        for unit, points in node.get("units", {}).items():
            for p in points:
                if p.get("form") not in ("10-K", "20-F"):
                    continue
                fy = p.get("fy")
                if p.get("fp") == "FY" and p.get("val") is not None and fy:
                    vals[str(fy)] = float(p["val"])
        if vals:
            return [vals[k] for k in sorted(vals)]
    return []


class SecFundamentalsAdapter(FundamentalsAdapter):
    """Derives the metrics screens need from XBRL companyfacts."""

    def __init__(self, http: HttpClient):
        self.http = http

    def fundamentals(self, meta: SecurityMeta) -> Optional[Fundamentals]:
        if not meta.cik:
            return None
        try:
            data = self.http.get_json(FACTS_URL.format(cik=_pad_cik(meta.cik)))
        except Exception:
            return None
        facts = data.get("facts", {})

        revenue = _latest_fact(facts, [
            "RevenueFromContractWithCustomerExcludingAssessedTax",
            "Revenues", "SalesRevenueNet"])
        net_income = _latest_fact(facts, ["NetIncomeLoss"])
        assets_cur = _latest_fact(facts, ["AssetsCurrent"])
        liab_cur = _latest_fact(facts, ["LiabilitiesCurrent"])
        lt_debt = _latest_fact(facts, [
            "LongTermDebtNoncurrent", "LongTermDebt"])
        equity = _latest_fact(facts, [
            "StockholdersEquity",
            "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"])
        ebit = _latest_fact(facts, ["OperatingIncomeLoss"])
        interest = _latest_fact(facts, ["InterestExpense"])
        shares = _latest_fact(facts, [
            "CommonStockSharesOutstanding",
            "WeightedAverageNumberOfDilutedSharesOutstanding"], "shares")
        eps = _latest_fact(facts, ["EarningsPerShareDiluted",
                                   "EarningsPerShareBasic"])
        gross = _latest_fact(facts, ["GrossProfit"])
        cfo = _latest_fact(facts, ["NetCashProvidedByUsedInOperatingActivities"])
        capex = _latest_fact(facts, [
            "PaymentsToAcquirePropertyPlantAndEquipment"])
        fixed = _latest_fact(facts, ["PropertyPlantAndEquipmentNet"])
        total_debt = (lt_debt or 0) + (_latest_fact(facts, [
            "LongTermDebtCurrent", "DebtCurrent"]) or 0)

        wc = (assets_cur - liab_cur) if (assets_cur is not None
                                         and liab_cur is not None) else None
        fcf = (cfo - capex) if (cfo is not None and capex is not None) else cfo
        cur_ratio = (assets_cur / liab_cur) if (assets_cur and liab_cur) else None
        roe = (net_income / equity) if (net_income is not None and equity) else None
        d2e = (total_debt / equity) if (total_debt is not None and equity) else None
        icov = (ebit / interest) if (ebit is not None and interest) else None
        gm = (gross / revenue) if (gross is not None and revenue) else None
        om = (ebit / revenue) if (ebit is not None and revenue) else None

        eps_hist = _annual_series(facts, ["EarningsPerShareDiluted",
                                          "EarningsPerShareBasic"])
        cum_growth = None
        pos = [e for e in eps_hist if e is not None]
        if len(pos) >= 2 and pos[0] > 0:
            cum_growth = (pos[-1] - pos[0]) / abs(pos[0])

        f = Fundamentals(
            ticker=meta.ticker, as_of=data.get("entityName", "") and "",
            revenue=revenue, net_income=net_income, eps=eps,
            eps_history=eps_hist,
            current_ratio=cur_ratio, long_term_debt=lt_debt,
            working_capital=wc, total_debt=total_debt, total_equity=equity,
            debt_to_equity=d2e, interest_coverage=icov, roe=roe,
            gross_margin=gm, operating_margin=om, ebit=ebit,
            free_cash_flow=fcf, shares_outstanding=shares,
            net_working_capital=wc, net_fixed_assets=fixed,
            cumulative_eps_growth_10y=cum_growth,
        )
        return f


# --- 13F holdings -----------------------------------------------------------

_NS = {"": ""}  # 13F XML uses varying namespaces; we strip them below.


def _strip_ns(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _parse_information_table(xml_text: str) -> List[Dict[str, Any]]:
    """Parse a 13F information table into raw holding dicts."""
    rows: List[Dict[str, Any]] = []
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        return rows
    for info in root.iter():
        if _strip_ns(info.tag) != "infoTable":
            continue
        rec: Dict[str, Any] = {}
        for child in info:
            tag = _strip_ns(child.tag)
            if tag == "nameOfIssuer":
                rec["issuer"] = (child.text or "").strip()
            elif tag == "cusip":
                rec["cusip"] = (child.text or "").strip().upper()
            elif tag == "value":
                rec["value"] = float(child.text or 0)
            elif tag == "shrsOrPrnAmt":
                for gc in child:
                    if _strip_ns(gc.tag) == "sshPrnamt":
                        rec["shares"] = float(gc.text or 0)
        if rec.get("cusip"):
            rows.append(rec)
    return rows


class SecHoldingsAdapter(HoldingsAdapter):
    """Fetches and parses 13F-HR filings for a manager CIK.

    ``resolver`` may be either an object with ``.resolve(cusip, issuer)`` (see
    :class:`guru_screener.cusip.CusipResolver`) or a plain ``{cusip: ticker}``
    dict; either is used to attach tickers to holdings.
    """

    def __init__(self, http: HttpClient, resolver: Any = None):
        self.http = http
        self.resolver = resolver

    def _ticker_for(self, cusip: str, issuer: str) -> Optional[str]:
        r = self.resolver
        if r is None:
            return None
        if hasattr(r, "resolve"):
            return r.resolve(cusip, issuer)
        return r.get(cusip)  # dict-like

    def _submissions(self, cik: str) -> Dict[str, Any]:
        return self.http.get_json(SUBMISSIONS_URL.format(cik=_pad_cik(cik)))

    def _filings_13f(self, cik: str) -> List[Dict[str, str]]:
        subs = self._submissions(cik)
        recent = subs.get("filings", {}).get("recent", {})
        out: List[Dict[str, str]] = []
        forms = recent.get("form", [])
        for i, form in enumerate(forms):
            if form not in ("13F-HR", "13F-HR/A"):
                continue
            out.append({
                "accession": recent["accessionNumber"][i],
                "filing_date": recent["filingDate"][i],
                "report_date": recent["reportDate"][i],
                "primary_doc": recent.get("primaryDocument", [""] * len(forms))[i],
            })
        return out

    def _find_info_table_doc(self, cik: str, acc_nodash: str) -> Optional[str]:
        """Locate the information-table XML within a filing's directory."""
        index_url = (f"https://www.sec.gov/cgi-bin/browse-edgar")  # not used
        dir_json = self.http.get_json(
            f"https://www.sec.gov/Archives/edgar/data/{_pad_cik(cik)}/"
            f"{acc_nodash}/index.json")
        for item in dir_json.get("directory", {}).get("item", []):
            name = item.get("name", "")
            if name.endswith(".xml") and "primary_doc" not in name:
                return name
        return None

    def _load_quarter(self, cik: str, manager: str, filing: Dict[str, str]
                      ) -> List[Holding]:
        acc_nodash = filing["accession"].replace("-", "")
        doc = self._find_info_table_doc(cik, acc_nodash)
        if not doc:
            return []
        url = ARCHIVE.format(cik=_pad_cik(cik), acc_nodash=acc_nodash, doc=doc)
        xml = self.http.get_text(url)
        raw = _parse_information_table(xml)
        total = sum(r.get("value", 0) for r in raw) or 1.0
        quarter = _report_to_quarter(filing["report_date"])
        holdings: List[Holding] = []
        for r in raw:
            holdings.append(Holding(
                manager=manager, cik=str(cik),
                ticker=self._ticker_for(r["cusip"], r.get("issuer", "")),
                cusip=r["cusip"], issuer=r.get("issuer", ""),
                shares=r.get("shares", 0.0),
                # 13F values historically reported in $ thousands.
                value=r.get("value", 0.0) * 1000.0,
                pct_portfolio=100.0 * r.get("value", 0.0) / total,
                quarter=quarter, filing_date=filing["filing_date"],
            ))
        return holdings

    def latest_holdings(self, cik: str, manager: str) -> List[Holding]:
        filings = self._filings_13f(cik)
        if not filings:
            return []
        return self._load_quarter(cik, manager, filings[0])

    def holdings_for_quarter(self, cik: str, manager: str, quarter: str
                             ) -> List[Holding]:
        for f in self._filings_13f(cik):
            if _report_to_quarter(f["report_date"]) == quarter:
                return self._load_quarter(cik, manager, f)
        return []


def _report_to_quarter(report_date: str) -> str:
    """'2024-03-31' -> '2024Q1'."""
    m = re.match(r"(\d{4})-(\d{2})", report_date or "")
    if not m:
        return report_date or ""
    year, month = m.group(1), int(m.group(2))
    return f"{year}Q{(month - 1) // 3 + 1}"
