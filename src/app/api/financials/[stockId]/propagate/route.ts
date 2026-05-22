import { NextRequest, NextResponse } from "next/server";
import type { FinancialQuarter } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ stockId: string }> };

/**
 * POST /api/financials/:stockId/propagate
 * Walks each year's Q4 netValue and writes it as the following year's Q1 previousNetValue.
 * The netValue is computed as: previousNetValue + eps + oci + other + dividends.
 */
export async function POST(_req: NextRequest, { params }: Params) {
  const { stockId } = await params;

  const stockExists = await prisma.stock.findUnique({ where: { id: stockId } });
  if (!stockExists) {
    return NextResponse.json({ error: "Stock not found" }, { status: 404 });
  }

  const quarters = await prisma.financialQuarter.findMany({
    where: { stockId },
    orderBy: [{ year: "asc" }, { quarter: "asc" }],
  });

  const updates: Array<{ year: number; previousNetValue: number }> = [];

  // Group by year, find Q4 rows with enough data to compute netValue
  const byYear = new Map<number, FinancialQuarter[]>();
  for (const q of quarters) {
    const list = byYear.get(q.year) ?? [];
    list.push(q);
    byYear.set(q.year, list);
  }

  for (const [year, rows] of byYear.entries()) {
    const q4 = rows.find((r) => r.quarter === "Q4");
    if (!q4) continue;

    const { eps, oci, other, dividends, previousNetValue } = q4;
    if (
      eps === null ||
      oci === null ||
      other === null ||
      dividends === null ||
      previousNetValue === null
    ) {
      continue;
    }

    const netValueChange =
      Number(eps) + Number(oci) + Number(other) + Number(dividends);
    const netValue = Number(previousNetValue) + netValueChange;

    updates.push({ year: year + 1, previousNetValue: netValue });
  }

  // Upsert Q1 previousNetValue for the following year
  let propagated = 0;
  for (const { year, previousNetValue } of updates) {
    await prisma.financialQuarter.upsert({
      where: { stockId_year_quarter: { stockId, year, quarter: "Q1" } },
      create: { stockId, year, quarter: "Q1", previousNetValue },
      update: { previousNetValue },
    });
    propagated++;
  }

  return NextResponse.json({ propagated });
}
