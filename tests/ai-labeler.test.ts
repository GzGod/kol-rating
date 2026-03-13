import assert from "node:assert/strict";
import test from "node:test";

test("normalizeTrackTags keeps new V2.1 tags and maps common synonyms", async () => {
  let mod: {
    normalizeTrackTags: (tags: string[]) => string[];
  };

  try {
    mod = await import("../src/lib/ai-labeler");
  } catch {
    assert.fail("ai-labeler module missing");
  }

  assert.deepEqual(mod.normalizeTrackTags(["RWA"]), ["RWA"]);
  assert.deepEqual(mod.normalizeTrackTags(["SocialFi"]), ["SocialFi"]);
  assert.deepEqual(mod.normalizeTrackTags(["Layer2", "DePIN"]), ["L1_L2", "AI_DePIN"]);
  assert.deepEqual(mod.normalizeTrackTags(["exchange"]), ["CeFi_Exchange"]);
});

test("inferTrackTagsFromText avoids Other for obvious Web3 topics", async () => {
  let mod: {
    inferTrackTagsFromText: (text: string) => string[];
  };

  try {
    mod = await import("../src/lib/ai-labeler");
  } catch {
    assert.fail("ai-labeler module missing");
  }

  assert.deepEqual(
    mod.inferTrackTagsFromText("Ondo tokenized treasuries and on-chain T-bills are pushing real world assets forward"),
    ["RWA"]
  );
  assert.deepEqual(
    mod.inferTrackTagsFromText("Farcaster and Lens are still the most interesting social protocols in crypto"),
    ["SocialFi"]
  );
  assert.deepEqual(
    mod.inferTrackTagsFromText("Solana DeFi liquidity on Jupiter keeps getting deeper"),
    ["L1_L2", "DeFi"]
  );
});

test("repairTrackLabelBatch fills malformed AI output with per-tweet fallback instead of all Other", async () => {
  let mod: {
    repairTrackLabelBatch: (
      tweets: Array<{ id: string; text: string }>,
      aiLabels: Array<{ id: string; tags: string[] }>
    ) => Array<{ id: string; tags: string[] }>;
  };

  try {
    mod = await import("../src/lib/ai-labeler");
  } catch {
    assert.fail("ai-labeler module missing");
  }

  const repaired = mod.repairTrackLabelBatch(
    [
      { id: "a", text: "Bittensor miners and DePIN demand are growing fast" },
      { id: "b", text: "Had amazing ramen in Tokyo today" },
    ],
    [{ id: "a", tags: ["DePIN"] }]
  );

  assert.deepEqual(repaired, [
    { id: "a", tags: ["AI_DePIN"] },
    { id: "b", tags: ["Other"] },
  ]);
});

test("repairTrackLabelBatch preserves AI labels but normalizes unknown project wording", async () => {
  let mod: {
    repairTrackLabelBatch: (
      tweets: Array<{ id: string; text: string }>,
      aiLabels: Array<{ id: string; tags: string[] }>
    ) => Array<{ id: string; tags: string[] }>;
  };

  try {
    mod = await import("../src/lib/ai-labeler");
  } catch {
    assert.fail("ai-labeler module missing");
  }

  const repaired = mod.repairTrackLabelBatch(
    [
      { id: "a", text: "Base ecosystem and ETH L2 competition keep accelerating" },
      { id: "b", text: "Lens social graph still feels underpriced" },
    ],
    [
      { id: "a", tags: ["ETH L2"] },
      { id: "b", tags: ["social", "creator economy"] },
    ]
  );

  assert.deepEqual(repaired, [
    { id: "a", tags: ["L1_L2"] },
    { id: "b", tags: ["SocialFi"] },
  ]);
});

test("runAiChatCompletion retries timeout failures and returns the later successful response", async () => {
  let mod: {
    runAiChatCompletion: (
      messages: Array<{ role: string; content: string }>,
      options: {
        task: "track" | "style";
        timeoutMs?: number;
        maxAttempts?: number;
      },
      deps?: {
        fetchImpl?: typeof fetch;
        sleep?: (ms: number) => Promise<void>;
        baseUrl?: string;
        apiKey?: string;
        model?: string;
      }
    ) => Promise<string>;
  };

  try {
    mod = await import("../src/lib/ai-labeler");
  } catch {
    assert.fail("ai-labeler module missing");
  }

  let attempts = 0;
  const raw = await mod.runAiChatCompletion(
    [{ role: "user", content: "hello" }],
    { task: "track", timeoutMs: 5, maxAttempts: 2 },
    {
      baseUrl: "https://example.com/v1",
      apiKey: "test-key",
      model: "test-model",
      sleep: async () => {},
      fetchImpl: async (_url, init) => {
        attempts++;
        if (attempts === 1) {
          return await new Promise<Response>((_resolve, reject) => {
            (init?.signal as AbortSignal | undefined)?.addEventListener(
              "abort",
              () => {
                const error = Object.assign(new Error("aborted"), { name: "AbortError" });
                reject(error);
              },
              { once: true }
            );
          });
        }

        return new Response(
          JSON.stringify({
            choices: [{ message: { content: '[{"id":"tweet_001","tags":["DeFi"]}]' } }],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        );
      },
    }
  );

  assert.equal(raw, '[{"id":"tweet_001","tags":["DeFi"]}]');
  assert.equal(attempts, 2);
});

test("labelKolSignals starts track and style labeling without waiting for one another", async () => {
  let mod: {
    labelKolSignals: (
      input: {
        trackTweets: Array<{ id: string; text: string }>;
        styleTweets?: Array<{ id: string; text: string }>;
      },
      deps?: {
        labelTracks?: (
          tweets: Array<{ id: string; text: string }>
        ) => Promise<Array<{ id: string; tags: string[] }>>;
        labelStyle?: (
          tweets: Array<{ id: string; text: string }>
        ) => Promise<{ primary_style: string; secondary_style?: string; reasoning: string }>;
      }
    ) => Promise<{
      trackLabels: Array<{ id: string; tags: string[] }>;
      style: { primary_style: string; secondary_style?: string; reasoning: string };
    }>;
  };

  try {
    mod = await import("../src/lib/ai-labeler");
  } catch {
    assert.fail("ai-labeler module missing");
  }

  const events: string[] = [];
  let resolveTracks: (() => void) | undefined;
  let resolveStyle: (() => void) | undefined;

  const pending = mod.labelKolSignals(
    {
      trackTweets: [{ id: "a", text: "Solana DeFi is busy" }],
      styleTweets: [{ id: "a", text: "Solana DeFi is busy" }],
    },
    {
      labelTracks: async () => {
        events.push("tracks:start");
        return await new Promise<Array<{ id: string; tags: string[] }>>((resolve) => {
          resolveTracks = () => {
            events.push("tracks:end");
            resolve([{ id: "a", tags: ["DeFi"] }]);
          };
        });
      },
      labelStyle: async () => {
        events.push("style:start");
        return await new Promise<{ primary_style: string; reasoning: string }>((resolve) => {
          resolveStyle = () => {
            events.push("style:end");
            resolve({ primary_style: "Analyst", reasoning: "thread-heavy" });
          };
        });
      },
    }
  );

  await Promise.resolve();
  assert.deepEqual(events, ["tracks:start", "style:start"]);

  resolveTracks?.();
  resolveStyle?.();

  const result = await pending;
  assert.deepEqual(result.trackLabels, [{ id: "a", tags: ["DeFi"] }]);
  assert.equal(result.style.primary_style, "Analyst");
});
