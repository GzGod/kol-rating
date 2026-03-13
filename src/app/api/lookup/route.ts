import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { lookupUser } from "@/lib/twitter";
import { processKol } from "@/lib/pipeline";

export const maxDuration = 60;

/** POST /api/lookup — instant KOL rating by handle */
export async function POST(request: NextRequest) {
  const { username } = await request.json();
  if (!username) {
    return NextResponse.json({ error: "username is required" }, { status: 400 });
  }

  const handle = username.replace("@", "").trim().toLowerCase();

  // Check if already scored recently (within 24h)
  const existing = await prisma.kol.findUnique({
    where: { username: handle },
    include: {
      tweets: { orderBy: { publishedAt: "desc" }, take: 20 },
    },
  });

  if (existing && existing.lastScoredAt) {
    const hoursSinceScored = (Date.now() - existing.lastScoredAt.getTime()) / (1000 * 60 * 60);
    if (hoursSinceScored < 24) {
      // Return cached result
      const trackCounts: Record<string, number> = {};
      for (const t of existing.tweets.filter((tw) => tw.trackTags.length > 0 && !tw.isRetweet)) {
        for (const tag of t.trackTags) trackCounts[tag] = (trackCounts[tag] || 0) + 1;
      }
      const trackDistribution = Object.entries(trackCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([tag, count]) => ({ tag, count }));

      return NextResponse.json({
        kol: existing,
        trackDistribution,
        cached: true,
      });
    }
  }

  try {
    // Lookup user on Twitter
    const user = await lookupUser(handle);

    // Create or update KOL record
    const kol = await prisma.kol.upsert({
      where: { username: user.username.toLowerCase() },
      create: {
        twitterId: user.id,
        username: user.username.toLowerCase(),
        displayName: user.name,
        bio: user.description,
        avatarUrl: user.profile_image_url,
        followerCount: user.public_metrics.followers_count,
        followingCount: user.public_metrics.following_count,
        tweetCount: user.public_metrics.tweet_count,
      },
      update: {
        displayName: user.name,
        bio: user.description,
        avatarUrl: user.profile_image_url,
        followerCount: user.public_metrics.followers_count,
        followingCount: user.public_metrics.following_count,
        tweetCount: user.public_metrics.tweet_count,
      },
    });

    // Run full pipeline (fetch tweets → AI label → score)
    const score = await processKol(kol.id);

    // Get updated KOL with tweets
    const updated = await prisma.kol.findUnique({
      where: { id: kol.id },
      include: {
        tweets: { orderBy: { publishedAt: "desc" }, take: 20, where: { isRetweet: false } },
      },
    });

    const trackDistribution = Object.entries(score.expertise.trackDistribution)
      .sort((a, b) => b[1] - a[1])
      .map(([tag, pct]) => ({ tag, count: pct }));

    return NextResponse.json({
      kol: updated,
      score,
      trackDistribution,
      cached: false,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("Lookup error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
