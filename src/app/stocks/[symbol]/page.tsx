import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ValuationGrid } from "@/components/grid/ValuationGrid";
import type { Metadata } from "next";
import type { ApiFinancialRow, QuarterLabel } from "@/lib/types";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ symbol: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { symbol } = await params;
  return { title: `${symbol} 估值矩陣 | 股票估值矩陣` };
}

export default async function StockPage({ params }: Props) {
  const { symbol } = await params;

  const stock = await prisma.stock.findUnique({
    where: { symbol },
    include: {
      quarters: {
        orderBy: [{ year: "asc" }, { quarter: "asc" }],
      },
    },
  });

  if (!stock) notFound();

  const initialData: ApiFinancialRow[] = stock.quarters.map((q) => ({
    id: q.id,
    stockId: q.stockId,
    year: q.year,
    quarter: q.quarter as QuarterLabel,
    eps: q.eps?.toString() ?? null,
    oci: q.oci?.toString() ?? null,
    other: q.other?.toString() ?? null,
    dividends: q.dividends?.toString() ?? null,
    otherEquityItems: q.otherEquityItems?.toString() ?? null,
    previousNetValue: q.previousNetValue?.toString() ?? null,
    updatedAt: q.updatedAt.toISOString(),
  }));

  return (
    <main className="flex h-screen flex-col overflow-hidden">
      <div className="shrink-0 border-b px-4 py-3">
        <h1 className="text-xl font-semibold">
          <span className="font-mono">{stock.symbol}</span> {stock.name}
        </h1>
        {stock.industry && (
          <p className="text-xs text-zinc-500">{stock.industry}</p>
        )}
      </div>

      <div className="min-h-0 flex-1">
        <ValuationGrid stockId={stock.id} initialData={initialData} />
      </div>
    </main>
  );
}
