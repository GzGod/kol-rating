import { KolList } from "@/components/KolList";
import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-white/10 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center text-sm font-bold">
              K
            </div>
            <h1 className="text-lg font-semibold">KOL Power Score</h1>
            <span className="text-xs text-white/30 hidden sm:inline">Web3 KOL 评级系统</span>
          </div>
          <Link
            href="/admin"
            className="text-sm text-white/40 hover:text-white/70 transition-colors"
          >
            管理
          </Link>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <KolList />
      </main>
    </div>
  );
}
