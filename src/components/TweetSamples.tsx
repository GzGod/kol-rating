"use client";

import { TRACK_LABELS, formatNumber } from "@/lib/utils";

interface TweetData {
  id: string;
  tweetId: string;
  text: string;
  likeCount: number;
  retweetCount: number;
  replyCount: number;
  quoteCount: number;
  impressionCount: number;
  trackTags: string[];
  publishedAt: string;
  isRetweet: boolean;
}

export function TweetSamples({ tweets }: { tweets: TweetData[] }) {
  if (tweets.length === 0) {
    return <div className="text-white/30 text-sm">暂无推文数据</div>;
  }

  return (
    <div className="space-y-3">
      {tweets.map((t) => (
        <a
          key={t.id}
          href={`https://x.com/i/status/${t.tweetId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="block bg-white/5 border border-white/10 rounded-xl p-3 hover:bg-white/8 transition-colors"
        >
          <div className="flex items-start gap-2">
            <p className="text-sm text-white/70 line-clamp-2 flex-1">{t.text}</p>
            {t.isRetweet && (
              <span className="text-xs text-white/25 shrink-0 px-1.5 py-0.5 bg-white/5 rounded">RT</span>
            )}
          </div>

          <div className="flex items-center gap-3 mt-2 flex-wrap">
            {t.trackTags.map((tag) => (
              <span key={tag} className="text-xs text-blue-400/70">{TRACK_LABELS[tag] || tag}</span>
            ))}

            <div className="flex items-center gap-3 ml-auto text-xs text-white/30">
              <span>{formatNumber(t.impressionCount)} 曝光</span>
              <span>{formatNumber(t.likeCount)} 赞</span>
              <span>{formatNumber(t.retweetCount)} 转</span>
              <span>{formatNumber(t.replyCount)} 评</span>
            </div>
          </div>
        </a>
      ))}
    </div>
  );
}
