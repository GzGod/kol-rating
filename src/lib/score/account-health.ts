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
}

export function calculateHealth(input: HealthInput): HealthResult {
  const { avgImpressions, followerCount, followingCount, followerHistory, retweetRatio } = input;

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
  let anomalyScore = 100;
  const anomalyFlags: string[] = [];

  // Follower/following ratio < 2
  if (followingCount > 0 && followerCount / followingCount < 2) {
    anomalyScore -= 20;
    anomalyFlags.push("粉丝/关注比 < 2，互关刷粉嫌疑");
  }

  // Low reach + high followers
  if (reachRate < 0.05 && followerCount > 10000) {
    anomalyScore -= 25;
    anomalyFlags.push("触达率 < 5% 且粉丝 > 10K，大量僵尸粉");
  }

  // High retweet ratio
  if (retweetRatio > 0.7) {
    anomalyScore -= 20;
    anomalyFlags.push("转发率 > 70%，原创内容极少");
  }

  anomalyScore = Math.max(0, anomalyScore);

  const score = reachAuthenticity * 0.4 + growthHealth * 0.3 + anomalyScore * 0.3;

  return {
    score: Math.round(score * 10) / 10,
    reachAuthenticity: Math.round(reachAuthenticity * 10) / 10,
    growthHealth: Math.round(growthHealth * 10) / 10,
    anomalyScore,
    anomalyFlags,
  };
}
