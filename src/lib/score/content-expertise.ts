export interface ExpertiseResult {
  score: number;
  trackFocus: number;
  originality: number;
  postingStability: number;
  topTrack: string;
  trackDistribution: Record<string, number>;
}

/**
 * Piecewise linear mapping for track focus ratio → score
 * 0%→0, 15%→25, 30%→50, 50%→80, 70%+→100
 */
function mapTrackFocus(ratio: number): number {
  if (ratio >= 0.50) {
    return Math.min(100, 80 + ((ratio - 0.50) / 0.20) * 20);
  } else if (ratio >= 0.30) {
    return 50 + ((ratio - 0.30) / 0.20) * 30;
  } else if (ratio >= 0.15) {
    return 25 + ((ratio - 0.15) / 0.15) * 25;
  } else {
    return (ratio / 0.15) * 25;
  }
}

interface TweetForExpertise {
  isRetweet: boolean;
  trackTags: string[];
  publishedAt: Date;
}

export function calculateExpertise(tweets: TweetForExpertise[]): ExpertiseResult {
  if (tweets.length === 0) {
    return { score: 0, trackFocus: 0, originality: 0, postingStability: 0, topTrack: "Other", trackDistribution: {} };
  }

  // Use up to 100 tweets
  const sample = tweets.slice(0, 100);
  const total = sample.length;

  // --- Track Focus (40%) ---
  const tagCounts: Record<string, number> = {};
  let taggedTweets = 0;
  for (const t of sample) {
    if (t.trackTags.length > 0) {
      taggedTweets++;
      for (const tag of t.trackTags) {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      }
    }
  }

  const sortedTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);
  const topTrack = sortedTags[0]?.[0] || "Other";
  const topCount = sortedTags[0]?.[1] || 0;
  const top1Ratio = total > 0 ? topCount / total : 0;
  const trackFocus = Math.round(mapTrackFocus(top1Ratio) * 10) / 10;

  // Track distribution as percentages
  const trackDistribution: Record<string, number> = {};
  for (const [tag, count] of sortedTags) {
    trackDistribution[tag] = Math.round((count / total) * 100);
  }

  // --- Originality (30%) ---
  const originalCount = sample.filter((t) => !t.isRetweet).length;
  const originality = Math.round((originalCount / total) * 100);

  // --- Posting Stability (30%) ---
  const now = new Date();
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const recentTweets = sample.filter((t) => t.publishedAt >= ninetyDaysAgo);

  const activeWeeks = new Set<number>();
  for (const t of recentTweets) {
    const weekNum = Math.floor((now.getTime() - t.publishedAt.getTime()) / (7 * 24 * 60 * 60 * 1000));
    if (weekNum < 12) activeWeeks.add(weekNum);
  }
  const postingStability = Math.round((activeWeeks.size / 12) * 100);

  const score = trackFocus * 0.4 + originality * 0.3 + postingStability * 0.3;

  return {
    score: Math.round(score * 10) / 10,
    trackFocus,
    originality,
    postingStability,
    topTrack,
    trackDistribution,
  };
}
