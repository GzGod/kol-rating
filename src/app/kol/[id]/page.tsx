import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ScoreBadge } from "@/components/ScoreBadge";
import { TRACK_LABELS, STYLE_LABELS, formatNumber, TIER_CONFIG } from "@/lib/utils";
import { KolDetailClient } from "./client";

export default async function KolDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const kol = await prisma.kol.findUnique({
    where: { id },
    include: {
      tweets: { orderBy: { publishedAt: "desc" }, take: 30 },
      followerHistory: { orderBy: { recordedAt: "desc" }, take: 12 },
      scoreHistory: { orderBy: { scoredAt: "desc" }, take: 12 },
    },
  });

  if (!kol) notFound();

  // Compute track distribution
  const trackCounts: Record<string, number> = {};
  const labeledTweets = kol.tweets.filter((t) => t.trackTags.length > 0 && !t.isRetweet);
  for (const t of labeledTweets) {
    for (const tag of t.trackTags) {
      trackCounts[tag] = (trackCounts[tag] || 0) + 1;
    }
  }
  const trackDistribution = Object.entries(trackCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([tag, count]) => ({ tag, count, pct: Math.round((count / Math.max(labeledTweets.length, 1)) * 100) }));

  const tierConfig = TIER_CONFIG[kol.tier] || TIER_CONFIG.D;

  // Serialize dates for client component
  const serializedTweets = kol.tweets.map((t) => ({
    ...t,
    publishedAt: t.publishedAt.toISOString(),
    fetchedAt: t.fetchedAt.toISOString(),
  }));

  return (
    <div className="min-h-screen">
      <header className="border-b border-white/10 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <Link href="/" className="text-white/40 hover:text-white/70 transition-colors">
            ← 返回列表
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* Profile Header */}
        <div className="flex items-start gap-5 mb-8">
          <div className="relative w-20 h-20 rounded-2xl overflow-hidden bg-white/10 shrink-0">
            {kol.avatarUrl ? (
              <Image src={kol.avatarUrl} alt={kol.displayName} fill className="object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white/30 text-2xl">?</div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-bold">{kol.displayName}</h1>
              <ScoreBadge tier={kol.tier} size="md" />
            </div>
            <a
              href={`https://x.com/${kol.username}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/40 hover:text-blue-400 transition-colors"
            >
              @{kol.username}
            </a>
            {kol.bio && <p className="text-sm text-white/50 mt-2 line-clamp-2">{kol.bio}</p>}

            <div className="flex items-center gap-4 mt-3 text-sm text-white/40">
              <span>{formatNumber(kol.followerCount)} 粉丝</span>
              <span>{formatNumber(kol.followingCount)} 关注</span>
              <span>{formatNumber(kol.tweetCount)} 推文</span>
            </div>

            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {kol.primaryTrack && (
                <span className="px-2 py-0.5 text-xs rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/20">
                  {TRACK_LABELS[kol.primaryTrack] || kol.primaryTrack}
                </span>
              )}
              {kol.primaryStyle && (
                <span className="px-2 py-0.5 text-xs rounded-full bg-purple-500/15 text-purple-400 border border-purple-500/20">
                  {STYLE_LABELS[kol.primaryStyle] || kol.primaryStyle}
                </span>
              )}
              {kol.secondaryStyle && (
                <span className="px-2 py-0.5 text-xs rounded-full bg-purple-500/10 text-purple-400/60 border border-purple-500/10">
                  {STYLE_LABELS[kol.secondaryStyle] || kol.secondaryStyle}
                </span>
              )}
            </div>
          </div>

          <div className="text-right shrink-0">
            <div className={`text-5xl font-bold ${tierConfig.color}`}>
              {Math.round(kol.powerScore)}
            </div>
            <div className="text-sm text-white/30 mt-1">Power Score</div>
          </div>
        </div>

        {/* Client-side interactive sections */}
        <KolDetailClient
          engagement={{
            score: kol.engagementScore,
            scaleScore: 0,
            efficiencyScore: 0,
            avgImpressions: 0,
            engagementRate: 0,
          }}
          expertise={{
            score: kol.expertiseScore,
            trackFocus: 0,
            originality: 0,
            postingStability: 0,
          }}
          health={{
            score: kol.healthScore,
            reachAuthenticity: 0,
            growthHealth: 0,
            anomalyScore: 0,
            anomalyFlags: [],
          }}
          trackDistribution={trackDistribution}
          tweets={serializedTweets}
        />
      </main>
    </div>
  );
}
