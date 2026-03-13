export interface HealthResult {
  score: number;
  reachAuthenticity: number;
  growthHealth: number;
  anomalyScore: number;
  anomalyFlags: string[];
}

interface FollowerSnapshot {
  count: number;
  recordedAt: Date;
}

interface HealthInput {
  avgImpressions: number;
  followerCount: number;
  followingCount: number;
  followerHistory: FollowerSnapshot[];
  tweetCount90d: number;
  retweetRatio: number; // retweets / total in last 100
  accountCreatedAt?: Date;
  recentTweets?: Array<{
    publishedAt: Date;
    text: string;
  }>;
}

function normalizeTweetFormat(text: string): string {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " url ")
    .replace(/@\w+/g, " @user ")
    .replace(/\$\w+/g, " $token ")
    .replace(/#\w+/g, " #tag ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasRecentTweetFlood(recentTweets: Array<{ publishedAt: Date; text: string }>): boolean {
  const byDay = new Map<string, number>();
  for (const tweet of recentTweets) {
    if (Number.isNaN(tweet.publishedAt.getTime())) {
      continue;
    }
    const key = tweet.publishedAt.toISOString().slice(0, 10);
    byDay.set(key, (byDay.get(key) || 0) + 1);
    if ((byDay.get(key) || 0) > 50) {
      return true;
    }
  }

  return false;
}

function hasRepeatedTweetFormat(recentTweets: Array<{ publishedAt: Date; text: string }>): boolean {
  if (recentTweets.length === 0) return false;

  const patternCounts = new Map<string, number>();
  for (const tweet of recentTweets.slice(0, 30)) {
    if (Number.isNaN(tweet.publishedAt.getTime())) {
      continue;
    }
    const normalized = normalizeTweetFormat(tweet.text);
    if (!normalized) continue;
    patternCounts.set(normalized, (patternCounts.get(normalized) || 0) + 1);
  }

  const topPatternCount = Math.max(0, ...patternCounts.values());
  const sampleSize = Math.min(recentTweets.length, 30);
  return sampleSize > 0 && topPatternCount / sampleSize > 0.7;
}

export function calculateHealth(input: HealthInput): HealthResult {
  const {
    avgImpressions,
    followerCount,
    followingCount,
    followerHistory,
    accountCreatedAt,
    recentTweets = [],
  } = input;

  // --- Reach Authenticity (40%) ---
  const reachRate = followerCount > 0 ? avgImpressions / followerCount : 0;
  const reachAuthenticity = Math.min(100, reachRate * 250);

  // --- Growth Health (30%) ---
  let growthHealth = 50; // default when insufficient data
  if (followerHistory.length >= 2) {
    const sorted = [...followerHistory].sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());
    const weeklyRates: number[] = [];

    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1].count;
      const curr = sorted[i].count;
      if (prev > 0) {
        weeklyRates.push((curr - prev) / prev);
      }
    }

    if (weeklyRates.length > 0) {
      // Check for spike: any single week > 20% growth
      const hasSpike = weeklyRates.some((r) => r > 0.2);
      if (hasSpike) {
        growthHealth = 10;
      } else {
        const mean = weeklyRates.reduce((s, r) => s + r, 0) / weeklyRates.length;
        const variance = weeklyRates.reduce((s, r) => s + (r - mean) ** 2, 0) / weeklyRates.length;
        growthHealth = Math.max(0, 100 - variance * 10000);
      }
    }
  }

  // --- Anomaly Detection (30%) ---
  let anomalyScore = 70;
  const anomalyFlags: string[] = [];
  const followerFollowingRatio = followingCount > 0 ? followerCount / followingCount : Infinity;
  const accountAgeMs = accountCreatedAt ? Date.now() - accountCreatedAt.getTime() : 0;

  if (followerFollowingRatio > 10) {
    anomalyScore += 10;
  }

  if (accountCreatedAt && accountAgeMs >= 2 * 365 * 24 * 60 * 60 * 1000) {
    anomalyScore += 10;
  }

  if (reachRate > 0.3) {
    anomalyScore += 10;
  }

  // Follower/following ratio < 2
  if (followingCount > 0 && followerFollowingRatio < 2) {
    anomalyScore -= 20;
    anomalyFlags.push("粉丝/关注比 < 2，互关刷粉嫌疑");
  }

  // Low reach + high followers
  if (reachRate < 0.05 && followerCount > 10000) {
    anomalyScore -= 25;
    anomalyFlags.push("触达率 < 5% 且粉丝 > 10K，大量僵尸粉");
  }

  if (hasRecentTweetFlood(recentTweets)) {
    anomalyScore -= 15;
    anomalyFlags.push("单日发推 > 50 条，疑似机器人或刷屏");
  }

  if (hasRepeatedTweetFormat(recentTweets)) {
    anomalyScore -= 20;
    anomalyFlags.push("最近推文 >70% 为重复格式，疑似自动化发帖");
  }

  anomalyScore = Math.max(0, Math.min(100, anomalyScore));

  const score = reachAuthenticity * 0.4 + growthHealth * 0.3 + anomalyScore * 0.3;

  return {
    score: Math.round(score * 10) / 10,
    reachAuthenticity: Math.round(reachAuthenticity * 10) / 10,
    growthHealth: Math.round(growthHealth * 10) / 10,
    anomalyScore,
    anomalyFlags,
  };
}
