import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/stocks/lookup?symbol=2330
 * Queries FinMind TaiwanStockInfo to resolve a symbol → name + industry.
 */
export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol")?.trim().toUpperCase();
  if (!symbol) {
    return NextResponse.json({ error: "symbol is required" }, { status: 400 });
  }

  try {
    const url = new URL("https://api.finmindtrade.com/api/v4/data");
    url.searchParams.set("dataset", "TaiwanStockInfo");
    url.searchParams.set("data_id", symbol);

    const res = await fetch(url.toString(), {
      headers: { "Accept-Encoding": "gzip" },
      next: { revalidate: 3600 }, // cache 1 hour
    });

    if (!res.ok) {
      return NextResponse.json({ error: "FinMind API error" }, { status: 502 });
    }

    const json = (await res.json()) as {
      status: number;
      data: Array<{
        stock_id: string;
        stock_name: string;
        industry_category: string;
        type: string;
      }>;
    };

    if (!json.data || json.data.length === 0) {
      return NextResponse.json({ error: "找不到此股票代碼" }, { status: 404 });
    }

    // Prefer TWSE (上市) over OTC (上櫃); take first matching entry
    const row =
      json.data.find((d) => d.type === "twse") ??
      json.data.find((d) => d.type === "otc") ??
      json.data[0];

    if (!row) {
      return NextResponse.json({ error: "找不到此股票代碼" }, { status: 404 });
    }

    return NextResponse.json({
      symbol: row.stock_id,
      name: row.stock_name,
      industry: row.industry_category ?? null,
    });
  } catch {
    return NextResponse.json({ error: "查詢失敗，請稍後再試" }, { status: 502 });
  }
}
