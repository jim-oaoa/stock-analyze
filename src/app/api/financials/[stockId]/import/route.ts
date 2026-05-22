import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ stockId: string }> };

interface FinMindRecord {
  date: string;
  stock_id: string;
  type: string;
  value: number;
}

interface FinMindDividend {
  date: string;
  CashEarningsDistribution: number;
  CashExDividendTradingDate: string;
}

async function fetchFinMind(
  dataset: string,
  symbol: string,
  startDate: string,
  endDate: string,
): Promise<FinMindRecord[]> {
  const url = new URL("https://api.finmindtrade.com/api/v4/data");
  url.searchParams.set("dataset", dataset);
  url.searchParams.set("data_id", symbol);
  url.searchParams.set("start_date", startDate);
  url.searchParams.set("end_date", endDate);

  const res = await fetch(url.toString(), { next: { revalidate: 0 } });
  if (!res.ok) return [];
  const json = (await res.json()) as { data?: FinMindRecord[] };
  return json.data ?? [];
}

function dateToQuarter(date: string): { year: number; quarter: "Q1" | "Q2" | "Q3" | "Q4" } | null {
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(date);
  if (!m) return null;
  const year = parseInt(m[1]!, 10);
  const month = parseInt(m[2]!, 10);
  const quarter =
    month <= 3 ? "Q1" :
    month <= 6 ? "Q2" :
    month <= 9 ? "Q3" : "Q4";
  return { year, quarter };
}

/**
 * POST /api/financials/:stockId/import
 * Imports all available quarterly financial data from FinMind for a stock.
 */
export async function POST(_req: NextRequest, { params }: Params) {
  const { stockId } = await params;

  const stock = await prisma.stock.findUnique({ where: { id: stockId } });
  if (!stock) {
    return NextResponse.json({ error: "Stock not found" }, { status: 404 });
  }

  const symbol = stock.symbol;
  const currentYear = new Date().getFullYear();
  const startDate = "2019-01-01";
  const endDate = `${currentYear}-12-31`;

  // ── Fetch all data in parallel ──────────────────────────────────────────────
  const [fsRecords, bsRecords, divRaw] = await Promise.all([
    fetchFinMind("TaiwanStockFinancialStatements", symbol, startDate, endDate),
    fetchFinMind("TaiwanStockBalanceSheet", symbol, "2018-10-01", endDate),
    fetchFinMind("TaiwanStockDividend", symbol, startDate, endDate) as Promise<unknown>,
  ]);
  const dividends = divRaw as FinMindDividend[];

  // ── Index by date ───────────────────────────────────────────────────────────
  const eps: Record<string, number> = {};
  const ociTotal: Record<string, number> = {};
  for (const r of fsRecords) {
    if (r.type === "EPS") eps[r.date] = r.value;
    if (r.type === "OtherComprehensiveIncome") ociTotal[r.date] = r.value;
  }

  const nvPerShare: Record<string, number> = {};
  const oeqPerShare: Record<string, number> = {};
  const capStock: Record<string, number> = {};
  for (const r of bsRecords) {
    if (r.type === "EquityAttributableToOwnersOfParent_per") nvPerShare[r.date] = r.value;
    if (r.type === "OtherEquityInterest_per") oeqPerShare[r.date] = r.value;
    if (r.type === "CapitalStock") capStock[r.date] = r.value;
  }

  // Map ex-dividend date → cash per share
  // Ex-dividend date determines which quarter the dividend is recorded
  const divByQuarterKey: Record<string, number> = {};
  for (const d of dividends) {
    if (!d.CashEarningsDistribution || d.CashEarningsDistribution === 0) continue;
    const exDate = d.CashExDividendTradingDate || d.date;
    const qInfo = dateToQuarter(exDate);
    if (!qInfo) continue;
    const key = `${qInfo.year}-${qInfo.quarter}`;
    divByQuarterKey[key] = -(d.CashEarningsDistribution); // negative = reduces net value
  }

  // ── Collect all quarter dates from financial statements ────────────────────
  const allDates = new Set([...Object.keys(eps), ...Object.keys(ociTotal)]);

  // Sort dates; build per-quarter payload
  type QuarterPayload = {
    year: number;
    quarter: "Q1" | "Q2" | "Q3" | "Q4";
    eps?: number;
    oci?: number;
    otherEquityItems?: number;
    previousNetValue?: number;
    dividends?: number;
  };

  const payloads: QuarterPayload[] = [];
  let prevNvDate = "2018-12-31"; // start from Q4 2018 net value for 2019 Q1

  // Group dates by year to determine previousNetValue cascade
  const datesByYear: Record<number, string[]> = {};
  for (const date of allDates) {
    const qInfo = dateToQuarter(date);
    if (!qInfo) continue;
    (datesByYear[qInfo.year] ??= []).push(date);
  }

  for (const [yearStr, dates] of Object.entries(datesByYear).sort(([a], [b]) => +a - +b)) {
    const year = parseInt(yearStr, 10);
    dates.sort();

    // Q1 previousNetValue = end of prior year Q4
    const priorQ4Date = `${year - 1}-12-31`;
    const q1PrevNv = nvPerShare[priorQ4Date] ?? nvPerShare[prevNvDate] ?? undefined;

    for (let i = 0; i < dates.length; i++) {
      const date = dates[i]!;
      const qInfo = dateToQuarter(date);
      if (!qInfo) continue;

      const epsVal = eps[date];
      const ociTotVal = ociTotal[date];
      const cap = capStock[date];
      const oeq = oeqPerShare[date];
      const key = `${year}-${qInfo.quarter}`;

      const ociPerShare =
        ociTotVal !== undefined && cap !== undefined && cap > 0
          ? parseFloat((ociTotVal / (cap / 10)).toFixed(4))
          : undefined;

      const payload: QuarterPayload = { year, quarter: qInfo.quarter };
      if (epsVal !== undefined) payload.eps = epsVal;
      if (ociPerShare !== undefined) payload.oci = ociPerShare;
      if (oeq !== undefined) payload.otherEquityItems = oeq;
      if (divByQuarterKey[key] !== undefined) payload.dividends = divByQuarterKey[key];

      // Set previousNetValue for Q1
      if (qInfo.quarter === "Q1" && q1PrevNv !== undefined) {
        payload.previousNetValue = parseFloat(q1PrevNv.toFixed(2));
      }

      payloads.push(payload);
      prevNvDate = date; // track for fallback
    }
  }

  // ── Upsert all quarters ─────────────────────────────────────────────────────
  let imported = 0;
  for (const p of payloads) {
    const data: Record<string, unknown> = {};
    if (p.eps !== undefined) data.eps = p.eps;
    if (p.oci !== undefined) data.oci = p.oci;
    if (p.otherEquityItems !== undefined) data.otherEquityItems = p.otherEquityItems;
    if (p.previousNetValue !== undefined) data.previousNetValue = p.previousNetValue;
    if (p.dividends !== undefined) data.dividends = p.dividends;
    if (Object.keys(data).length === 0) continue;

    await prisma.financialQuarter.upsert({
      where: { stockId_year_quarter: { stockId, year: p.year, quarter: p.quarter } },
      create: { stockId, year: p.year, quarter: p.quarter, ...data },
      update: data,
    });
    imported++;
  }

  // ── Propagate cross-year cascade ────────────────────────────────────────────
  // Re-use the same logic as the propagate endpoint
  const allQuarters = await prisma.financialQuarter.findMany({
    where: { stockId },
    orderBy: [{ year: "asc" }, { quarter: "asc" }],
  });

  const byYear = new Map<number, typeof allQuarters>();
  for (const q of allQuarters) {
    const list = byYear.get(q.year) ?? [];
    list.push(q);
    byYear.set(q.year, list);
  }

  const sortedYears = [...byYear.keys()].sort((a, b) => a - b);
  const propagatedQ1 = new Map<number, number>();
  let propagated = 0;

  for (const year of sortedYears) {
    const rows = (byYear.get(year) ?? []).sort((a, b) =>
      a.quarter.localeCompare(b.quarter),
    );
    const propagatedPrev = propagatedQ1.get(year);
    let runningNV: number | null = null;

    for (const row of rows) {
      const { eps, oci, other, dividends: div } = row;
      let prevNV: number | null;

      if (row.quarter === "Q1") {
        prevNV =
          propagatedPrev !== undefined
            ? propagatedPrev
            : row.previousNetValue !== null
              ? Number(row.previousNetValue)
              : null;
        if (propagatedPrev !== undefined && row.previousNetValue === null) {
          await prisma.financialQuarter.update({
            where: { stockId_year_quarter: { stockId, year, quarter: "Q1" } },
            data: { previousNetValue: propagatedPrev },
          });
        }
      } else {
        prevNV = runningNV;
      }

      if (prevNV === null || eps === null) { runningNV = null; continue; }

      runningNV =
        prevNV +
        Number(eps) +
        (oci ? Number(oci) : 0) +
        (other ? Number(other) : 0) +
        (div ? Number(div) : 0);
    }

    if (runningNV !== null) {
      const nextYear = year + 1;
      propagatedQ1.set(nextYear, runningNV);
      await prisma.financialQuarter.upsert({
        where: { stockId_year_quarter: { stockId, year: nextYear, quarter: "Q1" } },
        create: { stockId, year: nextYear, quarter: "Q1", previousNetValue: runningNV },
        update: { previousNetValue: runningNV },
      });
      propagated++;
    }
  }

  return NextResponse.json({ imported, propagated, symbol });
}
