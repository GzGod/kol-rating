import { TIER_CONFIG } from "@/lib/utils";

export function ScoreBadge({ tier, size = "md" }: { tier: string; size?: "sm" | "md" | "lg" }) {
  const config = TIER_CONFIG[tier] || TIER_CONFIG.D;
  const sizeClass = size === "lg" ? "w-14 h-14 text-2xl" : size === "md" ? "w-10 h-10 text-lg" : "w-7 h-7 text-xs";

  return (
    <div
      className={`${sizeClass} ${config.bg} ${config.color} ${config.border} border rounded-xl flex items-center justify-center font-bold shrink-0`}
    >
      {tier}
    </div>
  );
}

export function ScoreBar({ value, max = 100, color = "bg-blue-500" }: { value: number; max?: number; color?: string }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="h-2 bg-white/10 rounded-full overflow-hidden">
      <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
    </div>
  );
}
