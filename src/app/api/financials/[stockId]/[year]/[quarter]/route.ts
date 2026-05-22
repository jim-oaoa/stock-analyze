import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const UpsertQuarterSchema = z.object({
  eps: z.number().nullable().optional(),
  oci: z.number().nullable().optional(),
  other: z.number().nullable().optional(),
  dividends: z.number().nullable().optional(),
  otherEquityItems: z.number().nullable().optional(),
  previousNetValue: z.number().nullable().optional(),
});

const VALID_QUARTERS = ["Q1", "Q2", "Q3", "Q4"] as const;
type ValidQuarter = (typeof VALID_QUARTERS)[number];

type Params = {
  params: Promise<{ stockId: string; year: string; quarter: string }>;
};

export async function PUT(req: NextRequest, { params }: Params) {
  const { stockId, year: yearStr, quarter } = await params;

  const year = parseInt(yearStr, 10);
  if (isNaN(year)) {
    return NextResponse.json({ error: "Invalid year" }, { status: 400 });
  }
  if (!VALID_QUARTERS.includes(quarter as ValidQuarter)) {
    return NextResponse.json({ error: "Invalid quarter" }, { status: 400 });
  }

  const body = await req.json();
  const parsed = UpsertQuarterSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const stockExists = await prisma.stock.findUnique({ where: { id: stockId } });
  if (!stockExists) {
    return NextResponse.json({ error: "Stock not found" }, { status: 404 });
  }

  const row = await prisma.financialQuarter.upsert({
    where: {
      stockId_year_quarter: {
        stockId,
        year,
        quarter: quarter as ValidQuarter,
      },
    },
    create: {
      stockId,
      year,
      quarter: quarter as ValidQuarter,
      ...parsed.data,
    },
    update: parsed.data,
  });

  return NextResponse.json(row);
}
