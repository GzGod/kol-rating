import { calculateHealth } from "@/lib/score/account-health";
import { calculateExpertise } from "@/lib/score/content-expertise";
import { calculateEngagement } from "@/lib/score/engagement";
import type { LookupResponse } from "@/lib/lookup-types";
import type { ScoreBreakdown } from "@/lib/score/types";
import type { TwitterTweet, TwitterUser } from "@/lib/twitter";
import { getTier } from "@/lib/utils";

export interface TransientTrackLabel {
  id: string;
  tags: string[];
}

export interface TransientStyleLabel {
  primary_style: string;
  secondary_style?: string;
}

interface BuildTransientLookupInput {
  user: TwitterUser;
  tweets: TwitterTweet[];
  trackLabels: TransientTrackLabel[];
  style: TransientStyleLabel;
}

interface NormalizedTweet {
  tweetId: string;
  text: string;
  trackTags: string[];
  likeCount: number;
  retweetCount: number;
  replyCount: number;
  quoteCount: number;
  impressionCount: number;
  publishedAt: Date;
  isRetweet: boolean;
  isReply: boolean;
  isQuote: boolean;
}

function isRetweet(tweet: TwitterTweet): boolean {
  return tweet.referenced_tweets?.some((ref) => ref.type === "retweeted") ?? false;
}

function isReply(tweet: TwitterTweet): boolean {
  return tweet.referenced_tweets?.some((ref) => ref.type === "replied_to") ?? false;
}

function isQuote(tweet: TwitterTweet): boolean {
  return tweet.referenced_tweets?.some((ref) => ref.type === "quoted") ?? false;
}

function calculateTransientScore(user: TwitterUser, tweets: NormalizedTweet[]): ScoreBreakdown {
  const originalTweets = tweets.filter((tweet) => !tweet.isRetweet && !tweet.isReply);
  const engagement = calculateEngagement(
    originalTweets.slice(0, 30).map((tweet) => ({
      likeCount: tweet.likeCount,
      retweetCount: tweet.retweetCount,
      replyCount: tweet.replyCount,
      quoteCount: tweet.quoteCount,
      impressionCount: tweet.impressionCount,
    }))
  );

  const expertise = calculateExpertise(
    tweets.slice(0, 100).map((tweet) => ({
      isRetweet: tweet.isRetweet,
      trackTags: tweet.trackTags,
      publishedAt: tweet.publishedAt,
    }))
  );

  const retweetCount = tweets.filter((tweet) => tweet.isRetweet).length;
  const health = calculateHealth({
    avgImpressions: engagement.avgImpressions,
    followerCount: user.public_metrics.followers_count,
    followingCount: user.public_metrics.following_count,
    followerHistory: [],
    tweetCount90d: tweets.length,
    retweetRatio: tweets.length > 0 ? retweetCount / tweets.length : 0,
    accountCreatedAt: user.created_at ? new Date(user.created_at) : undefined,
    recentTweets: tweets.slice(0, 100).map((tweet) => ({
      publishedAt: tweet.publishedAt,
      text: tweet.text,
    })),
  });

  const powerScore =
    Math.round((engagement.score * 0.4 + expertise.score * 0.35 + health.score * 0.25) * 10) / 10;
  const tier = getTier(powerScore);

  return { powerScore, tier, engagement, expertise, health };
}

export function buildTransientLookupResult({
  user,
  tweets,
  trackLabels,
  style,
}: BuildTransientLookupInput): LookupResponse {
  const labelMap = new Map(trackLabels.map((label) => [label.id, label.tags]));
  const normalizedTweets = tweets
    .map<NormalizedTweet>((tweet) => ({
      tweetId: tweet.id,
      text: tweet.text,
      trackTags: labelMap.get(tweet.id) ?? [],
      likeCount: tweet.public_metrics.like_count,
      retweetCount: tweet.public_metrics.retweet_count,
      replyCount: tweet.public_metrics.reply_count,
      quoteCount: tweet.public_metrics.quote_count,
      impressionCount: tweet.public_metrics.impression_count,
      publishedAt: new Date(tweet.created_at),
      isRetweet: isRetweet(tweet),
      isReply: isReply(tweet),
      isQuote: isQuote(tweet),
    }))
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());

  const score = calculateTransientScore(user, normalizedTweets);
  const sortedTracks = Object.entries(score.expertise.trackDistribution).sort((a, b) => b[1] - a[1]);

  return {
    kol: {
      id: `transient:${user.id}`,
      username: user.username.toLowerCase(),
      displayName: user.name,
      avatarUrl: user.profile_image_url?.replace("_normal", "_400x400") || null,
      bio: user.description || null,
      followerCount: user.public_metrics.followers_count,
      followingCount: user.public_metrics.following_count,
      tweetCount: user.public_metrics.tweet_count,
      powerScore: score.powerScore,
      engagementScore: score.engagement.score,
      expertiseScore: score.expertise.score,
      healthScore: score.health.score,
      tier: score.tier,
      primaryTrack: score.expertise.topTrack || null,
      secondaryTrack: sortedTracks[1]?.[0] || null,
      primaryStyle: style.primary_style || null,
      secondaryStyle: style.secondary_style || null,
      tweets: normalizedTweets.map((tweet) => ({
        tweetId: tweet.tweetId,
        text: tweet.text,
        trackTags: tweet.trackTags,
        likeCount: tweet.likeCount,
        retweetCount: tweet.retweetCount,
        replyCount: tweet.replyCount,
        impressionCount: tweet.impressionCount,
        isRetweet: tweet.isRetweet,
      })),
    },
    score,
    trackDistribution: sortedTracks.map(([tag, count]) => ({ tag, count })),
    cached: false,
    persisted: false,
  };
}
