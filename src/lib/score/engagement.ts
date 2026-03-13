export interface EngagementResult {
  score: number;
  scaleScore: number;
  efficiencyScore: number;
  avgImpressions: number;
  avgEngagement: number;
  engagementRate: number;
}

interface TweetMetrics {
  likeCount: number;
  retweetCount: number;
  replyCount: number;
  quoteCount: number;
  impressionCount: number;
}

function getEfficiencyCoefficient(avgImpressions: number): number {
  return 2.2 + (9.8 * avgImpressions) / (avgImpressions + 30000);
}

export function calculateEngagement(tweets: TweetMetrics[]): EngagementResult {
  if (tweets.length === 0) {
    return { score: 0, scaleScore: 0, efficiencyScore: 0, avgImpressions: 0, avgEngagement: 0, engagementRate: 0 };
  }

  const count = Math.min(tweets.length, 30);
  const recent = tweets.slice(0, count);

  // Weighted engagement per tweet
  const totalEngagement = recent.reduce(
    (sum, t) => sum + t.likeCount * 1 + t.retweetCount * 3 + t.quoteCount * 5 + t.replyCount * 4,
    0
  );
  const totalImpressions = recent.reduce((sum, t) => sum + t.impressionCount, 0);

  const avgEngagement = totalEngagement / count;
  const avgImpressions = totalImpressions / count;

  // Scale score: Max(0, Min(100, 8.5 × ln(Avg_Impressions + 1) - 20))
  const scaleScore = Math.max(0, Math.min(100, 8.5 * Math.log(avgImpressions + 1) - 20));

  // Efficiency score: engagement rate per 1000 impressions × impression-aware coefficient
  const engagementRate = avgImpressions > 0 ? (avgEngagement / avgImpressions) * 1000 : 0;
  const efficiencyCoefficient = getEfficiencyCoefficient(avgImpressions);
  const efficiencyScore = Math.min(100, engagementRate * efficiencyCoefficient);

  const score = scaleScore * 0.5 + efficiencyScore * 0.5;

  return {
    score: Math.round(score * 10) / 10,
    scaleScore: Math.round(scaleScore * 10) / 10,
    efficiencyScore: Math.round(efficiencyScore * 10) / 10,
    avgImpressions: Math.round(avgImpressions),
    avgEngagement: Math.round(avgEngagement * 10) / 10,
    engagementRate: Math.round(engagementRate * 10) / 10,
  };
}
