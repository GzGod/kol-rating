"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { ScoreBadge } from "@/components/ScoreBadge";
import { formatNumber, TIER_CONFIG } from "@/lib/utils";

interface Kol {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  followerCount: number;
  powerScore: number;
  tier: string;
  lastFetchedAt: string | null;
}

export default function AdminPage() {
  const [kols, setKols] = useState<Kol[]>([]);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState("");
  const [adding, setAdding] = useState(false);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const fetchKols = useCallback(async () => {
    const res = await fetch("/api/kols?limit=100");
    const data = await res.json();
    setKols(data.kols || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchKols(); }, [fetchKols]);

  async function addKol(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim()) return;
    setAdding(true);
    setMessage("");

    try {
      const res = await fetch("/api/kols", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage(`已添加 @${data.kol.username}，Power Score: ${Math.round(data.kol.powerScore)}`);
        setUsername("");
        fetchKols();
      } else {
        setMessage(data.error || "添加失败");
      }
    } catch {
      setMessage("网络错误");
    }
    setAdding(false);
  }

  async function refreshKol(id: string) {
    setRefreshingId(id);
    try {
      await fetch(`/api/kols/${id}/refresh`, { method: "POST" });
      fetchKols();
    } catch {
      setMessage("刷新失败");
    }
    setRefreshingId(null);
  }

  async function deleteKol(id: string, username: string) {
    if (!confirm(`确定删除 @${username}？`)) return;
    await fetch(`/api/kols/${id}`, { method: "DELETE" });
    fetchKols();
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-white/10 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-white/40 hover:text-white/70 transition-colors">← 首页</Link>
            <h1 className="text-lg font-semibold">KOL 管理</h1>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        {/* Add KOL */}
        <form onSubmit={addKol} className="flex gap-3 mb-6">
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="输入 Twitter @handle 添加 KOL"
            className="flex-1 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-white/30"
          />
          <button
            type="submit"
            disabled={adding}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-xl font-medium transition-colors shrink-0"
          >
            {adding ? "添加中..." : "添加"}
          </button>
        </form>

        {message && (
          <div className="mb-4 px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white/70">
            {message}
          </div>
        )}

        {/* KOL List */}
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-4 animate-pulse h-16" />
            ))}
          </div>
        ) : kols.length === 0 ? (
          <div className="text-center py-20 text-white/30">还没有添加任何 KOL</div>
        ) : (
          <div className="space-y-2">
            {kols.map((kol) => {
              const tierConfig = TIER_CONFIG[kol.tier] || TIER_CONFIG.D;
              return (
                <div key={kol.id} className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl px-4 py-3">
                  <div className="relative w-10 h-10 rounded-full overflow-hidden bg-white/10 shrink-0">
                    {kol.avatarUrl ? (
                      <Image src={kol.avatarUrl} alt={kol.displayName} fill className="object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white/30">?</div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{kol.displayName}</span>
                      <span className="text-sm text-white/40">@{kol.username}</span>
                    </div>
                    <div className="text-xs text-white/30">
                      {formatNumber(kol.followerCount)} followers
                      {kol.lastFetchedAt && ` · 更新于 ${new Date(kol.lastFetchedAt).toLocaleDateString("zh-CN")}`}
                    </div>
                  </div>

                  <ScoreBadge tier={kol.tier} size="sm" />
                  <span className={`text-lg font-bold ${tierConfig.color} w-10 text-right`}>
                    {Math.round(kol.powerScore)}
                  </span>

                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => refreshKol(kol.id)}
                      disabled={refreshingId === kol.id}
                      className="px-3 py-1 text-xs bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {refreshingId === kol.id ? "..." : "刷新"}
                    </button>
                    <button
                      onClick={() => deleteKol(kol.id, kol.username)}
                      className="px-3 py-1 text-xs bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-lg transition-colors"
                    >
                      删除
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
