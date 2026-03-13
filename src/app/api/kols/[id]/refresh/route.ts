import { NextRequest, NextResponse } from "next/server";
import { processKol } from "@/lib/pipeline";

export async function POST(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const result = await processKol(id);
    return NextResponse.json({ ok: true, score: result });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
