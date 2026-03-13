"use client";

import { ScoreBreakdown } from "@/components/ScoreBreakdown";
import { TrackDistribution } from "@/components/TrackDistribution";
import { TweetSamples } from "@/components/TweetSamples";

interface Props {
  engagement: { score: number; scaleScore: number; efficiencyScore: number; avgImpressions: number; engagementRate: number };
  expertise: { score: number; trackFocus: number; originality: number; postingStability: number };
  health: { score: number; reachAuthenticity: number; growthHealth: number; anomalyScore: number; anomalyFlags: string[] };
  trackDistribution: { tag: string; count: number; pct: number }[];
  tweets: {
    id: string;
    tweetId: string;
    text: string;
    likeCount: number;
    retweetCount: number;
    replyCount: number;
    quoteCount: number;
    impressionCount: number;
    trackTags: string[];
    publishedAt: string;
    isRetweet: boolean;
  }[];
}

export function KolDetailClient({ engagement, expertise, health, trackDistribution, tweets }: Props) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left: Score Breakdown */}
      <div className="lg:col-span-2 space-y-6">
        <div>
          <h2 className="text-lg font-semibold mb-4">评分详情</h2>
          <ScoreBreakdown engagement={engagement} expertise={expertise} health={health} />
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-4">最近推文</h2>
          <TweetSamples tweets={tweets.slice(0, 15)} />
        </div>
      </div>

      {/* Right: Track Distribution */}
      <div className="space-y-6">
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <h3 className="font-medium mb-4">赛道分布</h3>
          <TrackDistribution tracks={trackDistribution} />
        </div>
      </div>
    </div>
  );
}
