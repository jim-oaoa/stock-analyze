import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ stockId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { stockId } = await params;
  const quarters = await prisma.financialQuarter.findMany({
    where: { stockId },
    orderBy: [{ year: "asc" }, { quarter: "asc" }],
  });
  return NextResponse.json(quarters);
}
