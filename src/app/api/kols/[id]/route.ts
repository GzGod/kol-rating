import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const kol = await prisma.kol.findUnique({
    where: { id },
    include: {
      tweets: { orderBy: { publishedAt: "desc" }, take: 30 },
      followerHistory: { orderBy: { recordedAt: "desc" }, take: 12 },
      scoreHistory: { orderBy: { scoredAt: "desc" }, take: 12 },
    },
  });

  if (!kol) {
    return NextResponse.json({ error: "KOL not found" }, { status: 404 });
  }

  // Compute track distribution from tweets
  const trackCounts: Record<string, number> = {};
  const labeledTweets = kol.tweets.filter((t) => t.trackTags.length > 0 && !t.isRetweet);
  for (const t of labeledTweets) {
    for (const tag of t.trackTags) {
      trackCounts[tag] = (trackCounts[tag] || 0) + 1;
    }
  }
  const trackDistribution = Object.entries(trackCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([tag, count]) => ({ tag, count, pct: Math.round((count / Math.max(labeledTweets.length, 1)) * 100) }));

  return NextResponse.json({ kol, trackDistribution });
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.kol.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
