export interface ScoreBreakdown {
  powerScore: number;
  tier: string;
  engagement: {
    score: number;
    scaleScore: number;
    efficiencyScore: number;
    avgImpressions: number;
    avgEngagement: number;
    engagementRate: number;
  };
  expertise: {
    score: number;
    trackFocus: number;
    originality: number;
    postingStability: number;
    topTrack: string;
    trackDistribution: Record<string, number>;
  };
  health: {
    score: number;
    reachAuthenticity: number;
    growthHealth: number;
    anomalyScore: number;
    anomalyFlags: string[];
  };
}
