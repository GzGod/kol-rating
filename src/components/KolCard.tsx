"use client";

import Image from "next/image";
import Link from "next/link";
import { ScoreBadge, ScoreBar } from "./ScoreBadge";
import { TRACK_LABELS, STYLE_LABELS, formatNumber, TIER_CONFIG } from "@/lib/utils";

interface KolData {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  followerCount: number;
  powerScore: number;
  tier: string;
  primaryTrack: string | null;
  primaryStyle: string | null;
  lastScoredAt: string | null;
}

export function KolCard({ kol }: { kol: KolData }) {
  const tierConfig = TIER_CONFIG[kol.tier] || TIER_CONFIG.D;

  return (
    <Link href={`/kol/${kol.id}`}>
      <div className="bg-white/5 border border-white/10 rounded-xl p-4 hover:bg-white/8 hover:border-white/20 transition-all cursor-pointer group">
        <div className="flex items-start gap-3">
          <div className="relative w-12 h-12 rounded-full overflow-hidden bg-white/10 shrink-0">
            {kol.avatarUrl ? (
              <Image src={kol.avatarUrl} alt={kol.displayName} fill className="object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white/30 text-lg">?</div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold truncate">{kol.displayName}</span>
              <ScoreBadge tier={kol.tier} size="sm" />
            </div>
            <div className="text-sm text-white/40">@{kol.username}</div>
          </div>

          <div className="text-right shrink-0">
            <div className={`text-2xl font-bold ${tierConfig.color}`}>
              {Math.round(kol.powerScore)}
            </div>
            <div className="text-xs text-white/30">Power Score</div>
          </div>
        </div>

        <div className="mt-3">
          <ScoreBar value={kol.powerScore} color={tierConfig.color.replace("text-", "bg-")} />
        </div>

        <div className="mt-3 flex items-center gap-2 flex-wrap">
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
          <span className="text-xs text-white/30 ml-auto">{formatNumber(kol.followerCount)} followers</span>
        </div>
      </div>
    </Link>
  );
}
