import assert from "node:assert/strict";
import test from "node:test";

test("resolveHandleLookup falls back to transient lookup on database connectivity errors", async () => {
  let mod: {
    resolveHandleLookup: (
      handle: string,
      deps: {
        loadPersisted: (normalizedHandle: string) => Promise<{ source: string }>;
        loadTransient: (normalizedHandle: string) => Promise<{ source: string }>;
      }
    ) => Promise<{ source: string }>;
  };

  try {
    mod = await import("../src/lib/lookup-service");
  } catch {
    assert.fail("lookup-service module missing");
  }

  const calls: string[] = [];
  const result = await mod.resolveHandleLookup("Vitalik", {
    async loadPersisted(normalizedHandle) {
      calls.push(`persisted:${normalizedHandle}`);
      const error = new Error("db unavailable") as Error & { code?: string };
      error.code = "P1001";
      throw error;
    },
    async loadTransient(normalizedHandle) {
      calls.push(`transient:${normalizedHandle}`);
      return { source: normalizedHandle };
    },
  });

  assert.equal(result.source, "vitalik");
  assert.deepEqual(calls, ["persisted:vitalik", "transient:vitalik"]);
});

test("resolveHandleLookup falls back when persistence schema is missing", async () => {
  let mod: {
    resolveHandleLookup: (
      handle: string,
      deps: {
        loadPersisted: (normalizedHandle: string) => Promise<{ source: string }>;
        loadTransient: (normalizedHandle: string) => Promise<{ source: string }>;
      }
    ) => Promise<{ source: string }>;
  };

  try {
    mod = await import("../src/lib/lookup-service");
  } catch {
    assert.fail("lookup-service module missing");
  }

  const calls: string[] = [];
  const result = await mod.resolveHandleLookup("xuegaogx", {
    async loadPersisted(normalizedHandle) {
      calls.push(`persisted:${normalizedHandle}`);
      const error = new Error("The table `public.Kol` does not exist in the current database.") as Error & { code?: string };
      error.code = "P2021";
      throw error;
    },
    async loadTransient(normalizedHandle) {
      calls.push(`transient:${normalizedHandle}`);
      return { source: normalizedHandle };
    },
  });

  assert.equal(result.source, "xuegaogx");
  assert.deepEqual(calls, ["persisted:xuegaogx", "transient:xuegaogx"]);
});

test("buildTransientLookupResult computes score, tags, and tweet payload without persistence", async () => {
  let mod: {
    buildTransientLookupResult: (input: {
      user: {
        id: string;
        username: string;
        name: string;
        description: string;
        profile_image_url: string;
        public_metrics: {
          followers_count: number;
          following_count: number;
          tweet_count: number;
        };
      };
      tweets: Array<{
        id: string;
        text: string;
        created_at: string;
        public_metrics: {
          like_count: number;
          retweet_count: number;
          reply_count: number;
          quote_count: number;
          impression_count: number;
        };
        referenced_tweets?: Array<{ type: "retweeted" | "replied_to" | "quoted"; id: string }>;
      }>;
      trackLabels: Array<{ id: string; tags: string[] }>;
      style: { primary_style: string; secondary_style?: string };
    }) => {
      cached: boolean;
      kol: {
        username: string;
        primaryTrack: string | null;
        primaryStyle: string | null;
        tweets: Array<{ tweetId: string; trackTags: string[] }>;
      };
      score: {
        powerScore: number;
        tier: string;
        expertise: { topTrack: string };
      };
      trackDistribution: Array<{ tag: string; count: number }>;
    };
  };

  try {
    mod = await import("../src/lib/transient-lookup");
  } catch {
    assert.fail("transient-lookup module missing");
  }

  const now = new Date("2026-03-13T00:00:00.000Z");
  const result = mod.buildTransientLookupResult({
    user: {
      id: "42",
      username: "vitalik",
      name: "Vitalik",
      description: "Ethereum",
      profile_image_url: "https://pbs.twimg.com/profile_images/example.jpg",
      public_metrics: {
        followers_count: 1000000,
        following_count: 500,
        tweet_count: 12000,
      },
    },
    tweets: [
      {
        id: "t1",
        text: "rollup update",
        created_at: now.toISOString(),
        public_metrics: {
          like_count: 100,
          retweet_count: 20,
          reply_count: 10,
          quote_count: 5,
          impression_count: 10000,
        },
      },
      {
        id: "t2",
        text: "another rollup thread",
        created_at: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        public_metrics: {
          like_count: 80,
          retweet_count: 15,
          reply_count: 8,
          quote_count: 2,
          impression_count: 8000,
        },
      },
      {
        id: "t3",
        text: "commentary",
        created_at: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString(),
        public_metrics: {
          like_count: 40,
          retweet_count: 5,
          reply_count: 3,
          quote_count: 1,
          impression_count: 5000,
        },
        referenced_tweets: [{ type: "retweeted", id: "x" }],
      },
    ],
    trackLabels: [
      { id: "t1", tags: ["L1_L2"] },
      { id: "t2", tags: ["L1_L2"] },
    ],
    style: {
      primary_style: "Analyst",
      secondary_style: "Opinion_Leader",
    },
  });

  assert.equal(result.cached, false);
  assert.equal(result.kol.username, "vitalik");
  assert.equal(result.kol.primaryTrack, "L1_L2");
  assert.equal(result.kol.primaryStyle, "Analyst");
  assert.equal(result.score.expertise.topTrack, "L1_L2");
  assert.ok(result.score.powerScore > 0, "power score should be computed");
  assert.equal(result.kol.tweets[0]?.tweetId, "t1");
  assert.deepEqual(result.kol.tweets[0]?.trackTags, ["L1_L2"]);
  assert.deepEqual(result.trackDistribution[0], { tag: "L1_L2", count: 67 });
});
