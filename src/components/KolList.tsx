"use client";

import { useState, useEffect, useCallback } from "react";
import { KolCard } from "./KolCard";
import { TRACK_LABELS } from "@/lib/utils";

const TIERS = ["S", "A", "B", "C", "D"];
const TRACKS = Object.keys(TRACK_LABELS);

interface Kol {
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

export function KolList() {
  const [kols, setKols] = useState<Kol[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tier, setTier] = useState("");
  const [track, setTrack] = useState("");
  const [sort, setSort] = useState("powerScore");
  const [page, setPage] = useState(1);

  const fetchKols = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (tier) params.set("tier", tier);
    if (track) params.set("track", track);
    params.set("sort", sort);
    params.set("page", page.toString());

    const res = await fetch(`/api/kols?${params}`);
    const data = await res.json();
    setKols(data.kols || []);
    setTotal(data.total || 0);
    setLoading(false);
  }, [search, tier, track, sort, page]);

  useEffect(() => {
    fetchKols();
  }, [fetchKols]);

  const totalPages = Math.ceil(total / 20);

  return (
    <div>
      {/* Search & Filters */}
      <div className="flex flex-col gap-3 mb-6">
        <input
          type="text"
          placeholder="搜索 KOL 名称或 @handle..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-white/30 transition-colors"
        />

        <div className="flex flex-wrap gap-2">
          {/* Tier filters */}
          <button
            onClick={() => { setTier(""); setPage(1); }}
            className={`px-3 py-1 text-sm rounded-lg border transition-colors ${!tier ? "bg-white/15 border-white/30 text-white" : "bg-white/5 border-white/10 text-white/50 hover:text-white/70"}`}
          >
            全部等级
          </button>
          {TIERS.map((t) => (
            <button
              key={t}
              onClick={() => { setTier(tier === t ? "" : t); setPage(1); }}
              className={`px-3 py-1 text-sm rounded-lg border transition-colors ${tier === t ? "bg-white/15 border-white/30 text-white" : "bg-white/5 border-white/10 text-white/50 hover:text-white/70"}`}
            >
              {t}
            </button>
          ))}

          <div className="w-px bg-white/10 mx-1" />

          {/* Sort */}
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="px-3 py-1 text-sm rounded-lg bg-white/5 border border-white/10 text-white/70 focus:outline-none"
          >
            <option value="powerScore">按分数排序</option>
            <option value="followers">按粉丝排序</option>
            <option value="name">按名称排序</option>
          </select>
        </div>

        {/* Track filters */}
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => { setTrack(""); setPage(1); }}
            className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${!track ? "bg-blue-500/20 border-blue-500/30 text-blue-400" : "bg-white/5 border-white/10 text-white/40 hover:text-white/60"}`}
          >
            全部赛道
          </button>
          {TRACKS.filter((t) => t !== "Other").map((t) => (
            <button
              key={t}
              onClick={() => { setTrack(track === t ? "" : t); setPage(1); }}
              className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${track === t ? "bg-blue-500/20 border-blue-500/30 text-blue-400" : "bg-white/5 border-white/10 text-white/40 hover:text-white/60"}`}
            >
              {TRACK_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="text-sm text-white/40 mb-4">
        共 {total} 个 KOL {tier && `· 等级 ${tier}`} {track && `· ${TRACK_LABELS[track]}`}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-4 animate-pulse h-40" />
          ))}
        </div>
      ) : kols.length === 0 ? (
        <div className="text-center py-20 text-white/30">
          {search || tier || track ? "没有找到匹配的 KOL" : "还没有添加任何 KOL，请在管理后台添加"}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {kols.map((kol) => (
            <KolCard key={kol.id} kol={kol} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-8">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              onClick={() => setPage(p)}
              className={`w-8 h-8 rounded-lg text-sm transition-colors ${p === page ? "bg-white/15 text-white" : "bg-white/5 text-white/40 hover:text-white/70"}`}
            >
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
