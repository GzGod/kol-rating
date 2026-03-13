import { NextRequest, NextResponse } from "next/server";
import { labelKolStyle, labelTweetTracks } from "@/lib/ai-labeler";
import type { LookupKol, LookupResponse } from "@/lib/lookup-types";
import { resolveHandleLookup, normalizeHandle } from "@/lib/lookup-service";
import { processKol } from "@/lib/pipeline";
import { prisma } from "@/lib/prisma";
import { buildTransientLookupResult } from "@/lib/transient-lookup";
import { getUserTweets, lookupUser } from "@/lib/twitter";

export const maxDuration = 60;

function serializeKol(
  kol: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
    bio: string | null;
    followerCount: number;
    followingCount: number;
    tweetCount: number;
    powerScore: number;
    engagementScore: number;
    expertiseScore: number;
    healthScore: number;
    tier: string;
    primaryTrack: string | null;
    secondaryTrack: string | null;
    primaryStyle: string | null;
    secondaryStyle: string | null;
    tweets: Array<{
      tweetId: string;
      text: string;
      trackTags: string[];
      likeCount: number;
      retweetCount: number;
      replyCount: number;
      impressionCount: number;
      isRetweet: boolean;
    }>;
  }
): LookupKol {
  return {
    id: kol.id,
    username: kol.username,
    displayName: kol.displayName,
    avatarUrl: kol.avatarUrl,
    bio: kol.bio,
    followerCount: kol.followerCount,
    followingCount: kol.followingCount,
    tweetCount: kol.tweetCount,
    powerScore: kol.powerScore,
    engagementScore: kol.engagementScore,
    expertiseScore: kol.expertiseScore,
    healthScore: kol.healthScore,
    tier: kol.tier,
    primaryTrack: kol.primaryTrack,
    secondaryTrack: kol.secondaryTrack,
    primaryStyle: kol.primaryStyle,
    secondaryStyle: kol.secondaryStyle,
    tweets: kol.tweets.map((tweet) => ({
      tweetId: tweet.tweetId,
      text: tweet.text,
      trackTags: tweet.trackTags,
      likeCount: tweet.likeCount,
      retweetCount: tweet.retweetCount,
      replyCount: tweet.replyCount,
      impressionCount: tweet.impressionCount,
      isRetweet: tweet.isRetweet,
    })),
  };
}

async function loadPersistedLookup(handle: string): Promise<LookupResponse> {
  const existing = await prisma.kol.findUnique({
    where: { username: handle },
    include: {
      tweets: { orderBy: { publishedAt: "desc" }, take: 20 },
    },
  });

  if (existing?.lastScoredAt) {
    const hoursSinceScored = (Date.now() - existing.lastScoredAt.getTime()) / (1000 * 60 * 60);
    if (hoursSinceScored < 24) {
      const trackCounts: Record<string, number> = {};
      for (const tweet of existing.tweets.filter((item) => item.trackTags.length > 0 && !item.isRetweet)) {
        for (const tag of tweet.trackTags) {
          trackCounts[tag] = (trackCounts[tag] || 0) + 1;
        }
      }

      const trackDistribution = Object.entries(trackCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([tag, count]) => ({ tag, count }));

      return {
        kol: serializeKol(existing),
        trackDistribution,
        cached: true,
      };
    }
  }

  const user = await lookupUser(handle);
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

  const score = await processKol(kol.id);
  const updated = await prisma.kol.findUnique({
    where: { id: kol.id },
    include: {
      tweets: { orderBy: { publishedAt: "desc" }, take: 20, where: { isRetweet: false } },
    },
  });

  const trackDistribution = Object.entries(score.expertise.trackDistribution)
    .sort((a, b) => b[1] - a[1])
    .map(([tag, pct]) => ({ tag, count: pct }));

  return {
    kol: updated ? serializeKol(updated) : null,
    score,
    trackDistribution,
    cached: false,
    persisted: true,
  };
}

async function loadTransientLookup(handle: string): Promise<LookupResponse> {
  const user = await lookupUser(handle);
  const tweets = await getUserTweets(user.id, 100);
  const originalTweets = tweets.filter(
    (tweet) => !tweet.referenced_tweets?.some((ref) => ref.type === "retweeted")
  );

  const trackLabels =
    originalTweets.length > 0
      ? await labelTweetTracks(originalTweets.map((tweet) => ({ id: tweet.id, text: tweet.text })))
      : [];

  const style =
    originalTweets.length > 0
      ? await labelKolStyle(originalTweets.slice(0, 30).map((tweet) => ({ id: tweet.id, text: tweet.text })))
      : { primary_style: "Analyst" as const };

  return buildTransientLookupResult({
    user,
    tweets,
    trackLabels,
    style,
  });
}

export async function POST(request: NextRequest) {
  const { username } = await request.json();
  const handle = normalizeHandle(typeof username === "string" ? username : "");

  if (!handle) {
    return NextResponse.json({ error: "username is required" }, { status: 400 });
  }

  try {
    const result = await resolveHandleLookup(handle, {
      loadPersisted: loadPersistedLookup,
      loadTransient: loadTransientLookup,
    });
    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Lookup error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
