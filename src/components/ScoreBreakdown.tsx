"use client";

import { ScoreBar } from "./ScoreBadge";

interface BreakdownProps {
  engagement: { score: number; scaleScore: number; efficiencyScore: number; avgImpressions: number; engagementRate: number };
  expertise: { score: number; trackFocus: number; originality: number; postingStability: number };
  health: { score: number; reachAuthenticity: number; growthHealth: number; anomalyScore: number; anomalyFlags: string[] };
}

function SubScore({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-white/40 w-20 shrink-0">{label}</span>
      <div className="flex-1">
        <ScoreBar value={value} color={color} />
      </div>
      <span className="text-xs text-white/60 w-8 text-right">{Math.round(value)}</span>
    </div>
  );
}

export function ScoreBreakdown({ engagement, expertise, health }: BreakdownProps) {
  const sections = [
    {
      title: "真实互动力",
      weight: "40%",
      score: engagement.score,
      color: "bg-amber-500",
      subs: [
        { label: "规模分", value: engagement.scaleScore },
        { label: "效率分", value: engagement.efficiencyScore },
      ],
      stats: [
        `平均曝光 ${engagement.avgImpressions.toLocaleString()}`,
        `互动转化率 ${engagement.engagementRate}‰`,
      ],
    },
    {
      title: "内容专业度",
      weight: "35%",
      score: expertise.score,
      color: "bg-purple-500",
      subs: [
        { label: "赛道专注度", value: expertise.trackFocus },
        { label: "原创率", value: expertise.originality },
        { label: "发文稳定性", value: expertise.postingStability },
      ],
      stats: [],
    },
    {
      title: "账号健康度",
      weight: "25%",
      score: health.score,
      color: "bg-emerald-500",
      subs: [
        { label: "触达真实度", value: health.reachAuthenticity },
        { label: "增长健康度", value: health.growthHealth },
        { label: "异常检测", value: health.anomalyScore },
      ],
      stats: health.anomalyFlags,
    },
  ];

  return (
    <div className="space-y-6">
      {sections.map((s) => (
        <div key={s.title} className="bg-white/5 border border-white/10 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${s.color}`} />
              <span className="font-medium">{s.title}</span>
              <span className="text-xs text-white/30">权重 {s.weight}</span>
            </div>
            <span className="text-lg font-bold text-white/80">{Math.round(s.score)}</span>
          </div>

          <div className="space-y-2">
            {s.subs.map((sub) => (
              <SubScore key={sub.label} label={sub.label} value={sub.value} color={s.color} />
            ))}
          </div>

          {s.stats.length > 0 && (
            <div className="mt-3 pt-3 border-t border-white/5">
              {s.stats.map((stat, i) => (
                <div key={i} className="text-xs text-white/30">{stat}</div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
