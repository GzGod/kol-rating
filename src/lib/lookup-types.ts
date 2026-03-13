import type { ScoreBreakdown } from "@/lib/score/types";

export interface LookupTweet {
  tweetId: string;
  text: string;
  trackTags: string[];
  likeCount: number;
  retweetCount: number;
  replyCount: number;
  impressionCount: number;
  isRetweet: boolean;
}

export interface LookupKol {
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
  tweets: LookupTweet[];
}

export interface LookupResponse {
  kol: LookupKol | null;
  score?: ScoreBreakdown;
  trackDistribution: Array<{ tag: string; count: number }>;
  cached: boolean;
  persisted?: boolean;
}
