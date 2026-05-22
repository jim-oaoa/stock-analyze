import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const CreateStockSchema = z.object({
  symbol: z.string().min(1).max(20),
  name: z.string().min(1).max(100),
  industry: z.string().optional(),
});

export async function GET() {
  const stocks = await prisma.stock.findMany({
    orderBy: { symbol: "asc" },
    select: {
      id: true,
      symbol: true,
      name: true,
      industry: true,
      updatedAt: true,
    },
  });
  return NextResponse.json(stocks);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = CreateStockSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }
  try {
    const stock = await prisma.stock.create({ data: parsed.data });
    return NextResponse.json(stock, { status: 201 });
  } catch (err: unknown) {
    // Prisma unique constraint violation (P2002)
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: string }).code === "P2002"
    ) {
      return NextResponse.json(
        { error: "股票代碼已存在" },
        { status: 409 },
      );
    }
    throw err;
  }
}
