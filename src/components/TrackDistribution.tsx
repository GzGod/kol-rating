"use client";

import { TRACK_LABELS } from "@/lib/utils";

interface TrackItem {
  tag: string;
  count: number;
  pct: number;
}

const TRACK_COLORS: Record<string, string> = {
  L1_L2: "bg-blue-500",
  DeFi: "bg-purple-500",
  NFT_Gaming: "bg-pink-500",
  AI_DePIN: "bg-cyan-500",
  Memecoin: "bg-yellow-500",
  CeFi_Exchange: "bg-orange-500",
  Macro_Policy: "bg-red-500",
  Security_Audit: "bg-emerald-500",
  Infra_Tool: "bg-indigo-500",
  BTC_Ecosystem: "bg-amber-500",
  Other: "bg-white/30",
};

export function TrackDistribution({ tracks }: { tracks: TrackItem[] }) {
  if (tracks.length === 0) {
    return <div className="text-white/30 text-sm">暂无赛道数据</div>;
  }

  const maxPct = Math.max(...tracks.map((t) => t.pct));

  return (
    <div className="space-y-2">
      {tracks.map((t) => (
        <div key={t.tag} className="flex items-center gap-3">
          <span className="text-xs text-white/50 w-20 shrink-0 truncate">
            {TRACK_LABELS[t.tag] || t.tag}
          </span>
          <div className="flex-1 h-5 bg-white/5 rounded-full overflow-hidden">
            <div
              className={`h-full ${TRACK_COLORS[t.tag] || "bg-white/30"} rounded-full transition-all duration-500 opacity-70`}
              style={{ width: `${(t.pct / maxPct) * 100}%` }}
            />
          </div>
          <span className="text-xs text-white/40 w-12 text-right">{t.pct}%</span>
          <span className="text-xs text-white/25 w-8 text-right">{t.count}</span>
        </div>
      ))}
    </div>
  );
}
