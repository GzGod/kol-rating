export function getTier(score: number): string {
  if (score >= 88) return "S";
  if (score >= 75) return "A";
  if (score >= 55) return "B";
  if (score >= 35) return "C";
  return "D";
}

export const TIER_CONFIG: Record<string, { color: string; bg: string; border: string; label: string }> = {
  S: { color: "text-amber-400", bg: "bg-amber-500/20", border: "border-amber-500/30", label: "顶级" },
  A: { color: "text-purple-400", bg: "bg-purple-500/20", border: "border-purple-500/30", label: "优秀" },
  B: { color: "text-blue-400", bg: "bg-blue-500/20", border: "border-blue-500/30", label: "良好" },
  C: { color: "text-white/50", bg: "bg-white/10", border: "border-white/20", label: "一般" },
  D: { color: "text-red-400", bg: "bg-red-500/20", border: "border-red-500/30", label: "较差" },
};

export const TRACK_LABELS: Record<string, string> = {
  L1_L2: "L1/L2",
  DeFi: "DeFi",
  NFT_Gaming: "NFT/Gaming",
  AI_DePIN: "AI/DePIN",
  Memecoin: "Memecoin",
  CeFi_Exchange: "CeFi/交易所",
  Macro_Policy: "宏观/政策",
  Security_Audit: "安全/审计",
  Infra_Tool: "基础设施",
  BTC_Ecosystem: "BTC 生态",
  RWA: "RWA",
  SocialFi: "SocialFi",
  Other: "其他",
};

export const STYLE_LABELS: Record<string, string> = {
  Analyst: "分析型",
  Opinion_Leader: "观点型",
  News_Curator: "新闻搬运型",
  Educator: "教程型",
  Shill: "喊单型",
  Community_Builder: "社区运营型",
};

export function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toString();
}
