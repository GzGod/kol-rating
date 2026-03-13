import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { processKol } from "@/lib/pipeline";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const kols = await prisma.kol.findMany({
    orderBy: { lastFetchedAt: "asc" },
    select: { id: true, username: true },
  });

  const results: { username: string; ok: boolean; error?: string }[] = [];

  for (const kol of kols) {
    try {
      await processKol(kol.id);
      results.push({ username: kol.username, ok: true });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Unknown error";
      results.push({ username: kol.username, ok: false, error: message });
    }
    // Rate limit between KOLs
    await new Promise((r) => setTimeout(r, 2000));
  }

  return NextResponse.json({ processed: results.length, results });
}
