"use client";

import { useState } from "react";
import Image from "next/image";
import { ScoreBadge, ScoreBar } from "@/components/ScoreBadge";
import { ScoreBreakdown } from "@/components/ScoreBreakdown";
import { TRACK_LABELS, STYLE_LABELS, formatNumber, TIER_CONFIG } from "@/lib/utils";

interface KolResult {
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
    tweets: { tweetId: string; text: string; trackTags: string[]; likeCount: number; retweetCount: number; replyCount: number; impressionCount: number; isRetweet: boolean }[];
  };
  score?: {
    powerScore: number;
    tier: string;
    engagement: { score: number; scaleScore: number; efficiencyScore: number; avgImpressions: number; avgEngagement: number; engagementRate: number };
    expertise: { score: number; trackFocus: number; originality: number; postingStability: number; topTrack: string; trackDistribution: Record<string, number> };
    health: { score: number; reachAuthenticity: number; growthHealth: number; anomalyScore: number; anomalyFlags: string[] };
  };
  trackDistribution: { tag: string; count: number }[];
  cached: boolean;
}

export default function Home() {
  const [handle, setHandle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<KolResult | null>(null);

  async function lookup(e: React.FormEvent) {
    e.preventDefault();
    const input = handle.replace("@", "").trim();
    if (!input) return;

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch("/api/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: input }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "查询失败");
      } else {
        setResult(data);
      }
    } catch {
      setError("网络错误，请重试");
    }
    setLoading(false);
  }

  const kol = result?.kol;
  const score = result?.score;
  const tierConfig = kol ? (TIER_CONFIG[kol.tier] || TIER_CONFIG.D) : null;

  return (
    <div className="min-h-screen">
      <header className="border-b border-white/10 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center text-sm font-bold">K</div>
            <h1 className="text-lg font-semibold">KOL Power Score</h1>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        {/* Search */}
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold mb-2">Web3 KOL 评级</h2>
          <p className="text-white/40 text-sm">输入 Twitter handle，即时获取 Power Score 评级</p>
        </div>

        <form onSubmit={lookup} className="flex gap-3 mb-8 max-w-xl mx-auto">
          <input
            type="text"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="输入 @handle，例如 elonmusk"
            className="flex-1 px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-blue-500/50 transition-colors text-center"
          />
          <button
            type="submit"
            disabled={loading}
            className="px-8 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-xl font-medium transition-colors shrink-0"
          >
            {loading ? "分析中..." : "查询"}
          </button>
        </form>

        {/* Loading */}
        {loading && (
          <div className="text-center py-16">
            <div className="inline-block w-8 h-8 border-2 border-white/20 border-t-blue-500 rounded-full animate-spin mb-4" />
            <p className="text-white/40 text-sm">正在抓取推文并分析，请稍候...</p>
            <p className="text-white/20 text-xs mt-1">首次查询需要 15-30 秒</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="max-w-xl mx-auto mb-6 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400 text-center">
            {error}
          </div>
        )}

        {/* Result */}
        {kol && tierConfig && (
          <div className="space-y-6 animate-in fade-in duration-500">
            {/* Profile + Score Header */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
              <div className="flex items-start gap-5">
                <div className="relative w-16 h-16 rounded-2xl overflow-hidden bg-white/10 shrink-0">
                  {kol.avatarUrl ? (
                    <Image src={kol.avatarUrl} alt={kol.displayName} fill className="object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white/30 text-xl">?</div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="text-xl font-bold">{kol.displayName}</span>
                    <ScoreBadge tier={kol.tier} size="sm" />
                    {result?.cached && <span className="text-xs text-white/20">缓存</span>}
                  </div>
                  <a href={`https://x.com/${kol.username}`} target="_blank" rel="noopener noreferrer" className="text-white/40 hover:text-blue-400 text-sm">
                    @{kol.username}
                  </a>
                  {kol.bio && <p className="text-xs text-white/40 mt-1.5 line-clamp-2">{kol.bio}</p>}
                  <div className="flex items-center gap-4 mt-2 text-xs text-white/30">
                    <span>{formatNumber(kol.followerCount)} 粉丝</span>
                    <span>{formatNumber(kol.followingCount)} 关注</span>
                    <span>{formatNumber(kol.tweetCount)} 推文</span>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className={`text-4xl font-bold ${tierConfig.color}`}>{Math.round(kol.powerScore)}</div>
                  <div className="text-xs text-white/30 mt-1">Power Score</div>
                </div>
              </div>

              {/* Score bar */}
              <div className="mt-4">
                <ScoreBar value={kol.powerScore} color={tierConfig.color.replace("text-", "bg-")} />
              </div>

              {/* Tags */}
              <div className="flex items-center gap-2 mt-4 flex-wrap">
                {kol.primaryTrack && (
                  <span className="px-2.5 py-1 text-xs rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/20">
                    {TRACK_LABELS[kol.primaryTrack] || kol.primaryTrack}
                  </span>
                )}
                {kol.primaryStyle && (
                  <span className="px-2.5 py-1 text-xs rounded-full bg-purple-500/15 text-purple-400 border border-purple-500/20">
                    {STYLE_LABELS[kol.primaryStyle] || kol.primaryStyle}
                  </span>
                )}
                {kol.secondaryStyle && (
                  <span className="px-2.5 py-1 text-xs rounded-full bg-purple-500/10 text-purple-400/60 border border-purple-500/10">
                    {STYLE_LABELS[kol.secondaryStyle] || kol.secondaryStyle}
                  </span>
                )}
              </div>
            </div>

            {/* Score Breakdown */}
            {score && (
              <ScoreBreakdown engagement={score.engagement} expertise={score.expertise} health={score.health} />
            )}

            {/* Track Distribution */}
            {result.trackDistribution.length > 0 && (
              <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                <h3 className="font-medium mb-3">赛道分布</h3>
                <div className="space-y-2">
                  {result.trackDistribution.map((t) => (
                    <div key={t.tag} className="flex items-center gap-3">
                      <span className="text-xs text-white/50 w-20 shrink-0">{TRACK_LABELS[t.tag] || t.tag}</span>
                      <div className="flex-1 h-4 bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500/50 rounded-full" style={{ width: `${Math.min(100, t.count)}%` }} />
                      </div>
                      <span className="text-xs text-white/40 w-10 text-right">{t.count}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent Tweets */}
            {kol.tweets && kol.tweets.length > 0 && (
              <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                <h3 className="font-medium mb-3">最近推文</h3>
                <div className="space-y-2">
                  {kol.tweets.slice(0, 10).map((t) => (
                    <a key={t.tweetId} href={`https://x.com/i/status/${t.tweetId}`} target="_blank" rel="noopener noreferrer"
                      className="block px-3 py-2 bg-white/3 rounded-lg hover:bg-white/5 transition-colors">
                      <p className="text-sm text-white/60 line-clamp-2">{t.text}</p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-white/25">
                        {t.trackTags.map((tag) => (
                          <span key={tag} className="text-blue-400/60">{TRACK_LABELS[tag] || tag}</span>
                        ))}
                        <span className="ml-auto">{formatNumber(t.impressionCount)} 曝光</span>
                        <span>{formatNumber(t.likeCount)} 赞</span>
                        <span>{formatNumber(t.retweetCount)} 转</span>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
