import assert from "node:assert/strict";
import test from "node:test";

function weeksAgo(weeks: number): Date {
  return new Date(Date.now() - weeks * 7 * 24 * 60 * 60 * 1000);
}

test("calculateEngagement uses the calibrated scale and efficiency formulas", async () => {
  const mod = await import("../src/lib/score/engagement");

  const result = mod.calculateEngagement([
    {
      likeCount: 100,
      retweetCount: 0,
      replyCount: 0,
      quoteCount: 0,
      impressionCount: 5000,
    },
  ]);

  assert.equal(result.avgImpressions, 5000);
  assert.equal(result.engagementRate, 20);
  assert.equal(result.scaleScore, 52.4);
  assert.equal(result.efficiencyScore, 44);
  assert.equal(result.score, 48.2);
});

test("calculateExpertise maps posting stability with the new step function", async () => {
  const mod = await import("../src/lib/score/content-expertise");

  const elevenWeeks = Array.from({ length: 11 }, (_, index) => ({
    isRetweet: false,
    trackTags: ["DeFi"],
    publishedAt: weeksAgo(index),
  }));
  const nineWeeks = Array.from({ length: 9 }, (_, index) => ({
    isRetweet: false,
    trackTags: ["DeFi"],
    publishedAt: weeksAgo(index),
  }));
  const fiveWeeks = Array.from({ length: 5 }, (_, index) => ({
    isRetweet: false,
    trackTags: ["DeFi"],
    publishedAt: weeksAgo(index),
  }));

  assert.equal(mod.calculateExpertise(elevenWeeks).postingStability, 85);
  assert.equal(mod.calculateExpertise(nineWeeks).postingStability, 50);
  assert.equal(mod.calculateExpertise(fiveWeeks).postingStability, 10);
});

test("calculateHealth uses base-plus-reward anomaly scoring and clamps obvious bad actors", async () => {
  const mod = await import("../src/lib/score/account-health");

  const highQuality = mod.calculateHealth({
    avgImpressions: 12000,
    followerCount: 20000,
    followingCount: 500,
    followerHistory: [],
    tweetCount90d: 30,
    retweetRatio: 0.1,
    accountCreatedAt: new Date("2020-01-01T00:00:00.000Z"),
    recentTweets: Array.from({ length: 30 }, (_, index) => ({
      publishedAt: weeksAgo(index % 4),
      text: `original analysis thread ${index}`,
    })),
  });

  assert.equal(highQuality.anomalyScore, 100);
  assert.deepEqual(highQuality.anomalyFlags, []);

  const suspicious = mod.calculateHealth({
    avgImpressions: 500,
    followerCount: 20000,
    followingCount: 15000,
    followerHistory: [],
    tweetCount90d: 80,
    retweetRatio: 0.2,
    accountCreatedAt: new Date("2025-06-01T00:00:00.000Z"),
    recentTweets: Array.from({ length: 60 }, () => ({
      publishedAt: new Date("2026-03-01T12:00:00.000Z"),
      text: "Join whitelist now http://example.com $TOKEN",
    })),
  });

  assert.equal(suspicious.anomalyScore, 0);
  assert.ok(suspicious.anomalyFlags.includes("粉丝/关注比 < 2，互关刷粉嫌疑"));
  assert.ok(suspicious.anomalyFlags.includes("触达率 < 5% 且粉丝 > 10K，大量僵尸粉"));
  assert.ok(suspicious.anomalyFlags.includes("单日发推 > 50 条，疑似机器人或刷屏"));
  assert.ok(suspicious.anomalyFlags.includes("最近推文 >70% 为重复格式，疑似自动化发帖"));
});

test("getTier uses the recalibrated score cutoffs", async () => {
  const mod = await import("../src/lib/utils");

  assert.equal(mod.getTier(88), "S");
  assert.equal(mod.getTier(87.9), "A");
  assert.equal(mod.getTier(75), "A");
  assert.equal(mod.getTier(74.9), "B");
  assert.equal(mod.getTier(55), "B");
  assert.equal(mod.getTier(54.9), "C");
  assert.equal(mod.getTier(35), "C");
  assert.equal(mod.getTier(34.9), "D");
});
