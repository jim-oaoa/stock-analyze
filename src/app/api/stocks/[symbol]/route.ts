import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const UpdateStockSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  industry: z.string().optional(),
});

type Params = { params: Promise<{ symbol: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { symbol } = await params;
  const stock = await prisma.stock.findUnique({ where: { symbol } });
  if (!stock) {
    return NextResponse.json({ error: "Stock not found" }, { status: 404 });
  }
  return NextResponse.json(stock);
}

export async function PUT(req: NextRequest, { params }: Params) {
  const { symbol } = await params;
  const body = await req.json();
  const parsed = UpdateStockSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const stock = await prisma.stock.update({
    where: { symbol },
    data: parsed.data,
  });
  return NextResponse.json(stock);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { symbol } = await params;
  await prisma.stock.delete({ where: { symbol } });
  return new NextResponse(null, { status: 204 });
}
