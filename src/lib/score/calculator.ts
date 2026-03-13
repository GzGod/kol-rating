import { prisma } from "@/lib/prisma";
import { calculateEngagement } from "./engagement";
import { calculateExpertise } from "./content-expertise";
import { calculateHealth } from "./account-health";
import { getTier } from "@/lib/utils";
import type { ScoreBreakdown } from "./types";

interface PowerScoreOptions {
  accountCreatedAt?: Date;
}

export async function calculatePowerScore(
  kolId: string,
  options: PowerScoreOptions = {}
): Promise<ScoreBreakdown> {
  const kol = await prisma.kol.findUniqueOrThrow({
    where: { id: kolId },
    include: {
      tweets: { orderBy: { publishedAt: "desc" }, take: 100 },
      followerHistory: { orderBy: { recordedAt: "desc" }, take: 12 },
    },
  });

  // --- Factor 1: Engagement (40%) ---
  const originalTweets = kol.tweets.filter((t) => !t.isRetweet && !t.isReply);
  const engagement = calculateEngagement(
    originalTweets.slice(0, 30).map((t) => ({
      likeCount: t.likeCount,
      retweetCount: t.retweetCount,
      replyCount: t.replyCount,
      quoteCount: t.quoteCount,
      impressionCount: t.impressionCount,
    }))
  );

  // --- Factor 2: Content Expertise (35%) ---
  const expertise = calculateExpertise(
    kol.tweets.slice(0, 100).map((t) => ({
      isRetweet: t.isRetweet,
      trackTags: t.trackTags,
      publishedAt: t.publishedAt,
    }))
  );

  // --- Factor 3: Account Health (25%) ---
  const retweetCount = kol.tweets.filter((t) => t.isRetweet).length;
  const health = calculateHealth({
    avgImpressions: engagement.avgImpressions,
    followerCount: kol.followerCount,
    followingCount: kol.followingCount,
    followerHistory: kol.followerHistory.map((s) => ({ count: s.count, recordedAt: s.recordedAt })),
    tweetCount90d: kol.tweets.length,
    retweetRatio: kol.tweets.length > 0 ? retweetCount / kol.tweets.length : 0,
    accountCreatedAt: options.accountCreatedAt,
    recentTweets: kol.tweets.slice(0, 100).map((tweet) => ({
      publishedAt: tweet.publishedAt,
      text: tweet.text,
    })),
  });

  const powerScore = Math.round((engagement.score * 0.4 + expertise.score * 0.35 + health.score * 0.25) * 10) / 10;
  const tier = getTier(powerScore);

  // Update KOL record
  await prisma.kol.update({
    where: { id: kolId },
    data: {
      powerScore,
      engagementScore: engagement.score,
      expertiseScore: expertise.score,
      healthScore: health.score,
      tier,
      primaryTrack: expertise.topTrack,
      lastScoredAt: new Date(),
    },
  });

  // Save score snapshot
  await prisma.scoreSnapshot.create({
    data: {
      kolId,
      powerScore,
      engagementScore: engagement.score,
      expertiseScore: expertise.score,
      healthScore: health.score,
      tier,
    },
  });

  return { powerScore, tier, engagement, expertise, health };
}
