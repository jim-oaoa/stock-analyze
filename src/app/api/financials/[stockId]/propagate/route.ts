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

  // Group by year, sort years ascending so cascade flows 2022→2023→2024
  const byYear = new Map<number, FinancialQuarter[]>();
  for (const q of quarters) {
    const list = byYear.get(q.year) ?? [];
    list.push(q);
    byYear.set(q.year, list);
  }
  const sortedYears = [...byYear.keys()].sort((a, b) => a - b);

  // Track propagated previousNetValue per year (updated as we go)
  const propagatedQ1: Map<number, number> = new Map();

  let propagated = 0;

  for (const year of sortedYears) {
    const rows = byYear.get(year) ?? [];
    const sorted = [...rows].sort((a, b) => a.quarter.localeCompare(b.quarter));

    // For Q1: use propagated value (from prior year's cascade) if available, else DB value
    const propagatedPrev = propagatedQ1.get(year);

    let runningNetValue: number | null = null;

    for (const row of sorted) {
      const { eps, oci, other, dividends } = row;

      let prevNV: number | null;
      if (row.quarter === "Q1") {
        prevNV =
          propagatedPrev !== undefined
            ? propagatedPrev
            : row.previousNetValue !== null
              ? Number(row.previousNetValue)
              : null;

        // If we have a propagated value that differs from DB, write it
        if (
          propagatedPrev !== undefined &&
          row.previousNetValue === null
        ) {
          await prisma.financialQuarter.update({
            where: { stockId_year_quarter: { stockId, year, quarter: "Q1" } },
            data: { previousNetValue: propagatedPrev },
          });
        }
      } else {
        prevNV = runningNetValue;
      }

      if (prevNV === null || eps === null) {
        runningNetValue = null;
        continue;
      }

      const netValueChange =
        Number(eps) +
        (oci !== null ? Number(oci) : 0) +
        (other !== null ? Number(other) : 0) +
        (dividends !== null ? Number(dividends) : 0);

      runningNetValue = prevNV + netValueChange;
    }

    // Propagate end-of-year netValue → next year's Q1 previousNetValue
    if (runningNetValue !== null) {
      const nextYear = year + 1;
      propagatedQ1.set(nextYear, runningNetValue);

      await prisma.financialQuarter.upsert({
        where: {
          stockId_year_quarter: { stockId, year: nextYear, quarter: "Q1" },
        },
        create: { stockId, year: nextYear, quarter: "Q1", previousNetValue: runningNetValue },
        update: { previousNetValue: runningNetValue },
      });
      propagated++;
    }
  }

  return NextResponse.json({ propagated });
}
