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

test("runAiChatCompletion falls back to /responses when legacy chat endpoint is rejected", async () => {
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

  const requestedUrls: string[] = [];
  const raw = await mod.runAiChatCompletion(
    [{ role: "user", content: "hello" }],
    { task: "track", maxAttempts: 1 },
    {
      baseUrl: "https://example.com/v1",
      apiKey: "test-key",
      model: "test-model",
      fetchImpl: async (input) => {
        const url = typeof input === "string" ? input : input.toString();
        requestedUrls.push(url);

        if (url.endsWith("/chat/completions")) {
          return new Response(
            JSON.stringify({
              error: {
                message:
                  "Unsupported legacy protocol: /v1/chat/completions is not supported. Please use /v1/responses.",
              },
            }),
            {
              status: 400,
              headers: { "Content-Type": "application/json" },
            }
          );
        }

        return new Response(
          JSON.stringify({
            output_text: '[{"id":"tweet_001","tags":["DeFi"]}]',
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
  assert.deepEqual(requestedUrls, [
    "https://example.com/v1/chat/completions",
    "https://example.com/v1/responses",
  ]);
});

test("runAiChatCompletion falls back to /responses when chat endpoint returns HTML", async () => {
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

  const requestedUrls: string[] = [];
  const raw = await mod.runAiChatCompletion(
    [{ role: "user", content: "hello" }],
    { task: "track", maxAttempts: 1 },
    {
      baseUrl: "https://example.com",
      apiKey: "test-key",
      model: "test-model",
      fetchImpl: async (input) => {
        const url = typeof input === "string" ? input : input.toString();
        requestedUrls.push(url);

        if (url.endsWith("/chat/completions")) {
          return new Response("<html>landing page</html>", {
            status: 200,
            headers: { "Content-Type": "text/html; charset=utf-8" },
          });
        }

        return new Response(
          JSON.stringify({
            output_text: '[{"id":"tweet_001","tags":["DeFi"]}]',
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
  assert.deepEqual(requestedUrls, [
    "https://example.com/chat/completions",
    "https://example.com/responses",
  ]);
});

test("runAiChatCompletion tries secondary responses URL when primary responses URL is unavailable", async () => {
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

  const requestedUrls: string[] = [];
  const raw = await mod.runAiChatCompletion(
    [{ role: "user", content: "hello" }],
    { task: "track", maxAttempts: 1 },
    {
      baseUrl: "https://example.com/v1",
      apiKey: "test-key",
      model: "test-model",
      fetchImpl: async (input) => {
        const url = typeof input === "string" ? input : input.toString();
        requestedUrls.push(url);

        if (url.endsWith("/chat/completions")) {
          return new Response(
            JSON.stringify({
              error: {
                message:
                  "Unsupported legacy protocol: /v1/chat/completions is not supported. Please use /v1/responses.",
              },
            }),
            {
              status: 400,
              headers: { "Content-Type": "application/json" },
            }
          );
        }

        if (url.endsWith("/v1/responses")) {
          return new Response(
            JSON.stringify({
              error: { message: "Service temporarily unavailable", type: "api_error" },
            }),
            {
              status: 503,
              headers: { "Content-Type": "application/json" },
            }
          );
        }

        return new Response(
          JSON.stringify({
            output_text: '[{"id":"tweet_001","tags":["DeFi"]}]',
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
  assert.deepEqual(requestedUrls, [
    "https://example.com/v1/chat/completions",
    "https://example.com/v1/responses",
    "https://example.com/responses",
  ]);
});

test("runAiChatCompletion retries 503 responses and eventually succeeds", async () => {
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
    { task: "track", maxAttempts: 3 },
    {
      baseUrl: "https://example.com/v1",
      apiKey: "test-key",
      model: "test-model",
      sleep: async () => {},
      fetchImpl: async () => {
        attempts++;
        if (attempts < 3) {
          return new Response(
            JSON.stringify({
              error: { message: "Service temporarily unavailable", type: "api_error" },
            }),
            {
              status: 503,
              headers: { "Content-Type": "application/json" },
            }
          );
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
  assert.equal(attempts, 3);
});

test("runAiChatCompletion enters cooldown after non-retryable 503", async () => {
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
    __resetAiUnavailableCooldownForTests: () => void;
  };

  try {
    mod = await import("../src/lib/ai-labeler");
  } catch {
    assert.fail("ai-labeler module missing");
  }

  mod.__resetAiUnavailableCooldownForTests();
  let fetchCalls = 0;

  try {
    await assert.rejects(
      mod.runAiChatCompletion(
        [{ role: "user", content: "hello" }],
        { task: "track", maxAttempts: 1 },
        {
          baseUrl: "https://example.com/v1",
          apiKey: "test-key",
          model: "test-model",
          fetchImpl: async () => {
            fetchCalls++;
            return new Response(
              JSON.stringify({
                error: { message: "Service temporarily unavailable", type: "api_error" },
              }),
              {
                status: 503,
                headers: { "Content-Type": "application/json" },
              }
            );
          },
        }
      ),
      /AI API error 503/
    );

    await assert.rejects(
      mod.runAiChatCompletion(
        [{ role: "user", content: "hello" }],
        { task: "track", maxAttempts: 1 },
        {
          baseUrl: "https://example.com/v1",
          apiKey: "test-key",
          model: "test-model",
          fetchImpl: async () => {
            fetchCalls++;
            throw new Error("should not be called during cooldown");
          },
        }
      ),
      /cooldown/
    );

    assert.equal(fetchCalls, 1);
  } finally {
    mod.__resetAiUnavailableCooldownForTests();
  }
});

test("labelTweetTracks skips remaining remote batches once service is unavailable", async () => {
  let mod: {
    labelTweetTracks: (tweets: Array<{ id: string; text: string }>) => Promise<Array<{ id: string; tags: string[] }>>;
    __resetAiUnavailableCooldownForTests: () => void;
  };

  try {
    mod = await import("../src/lib/ai-labeler");
  } catch {
    assert.fail("ai-labeler module missing");
  }

  mod.__resetAiUnavailableCooldownForTests();
  const originalFetch = globalThis.fetch;
  const previousApiKey = process.env.AI_API_KEY;
  const previousTrackAttempts = process.env.AI_TRACK_MAX_ATTEMPTS;
  process.env.AI_API_KEY = "test-key";
  process.env.AI_TRACK_MAX_ATTEMPTS = "1";
  let fetchCalls = 0;

  globalThis.fetch = (async () => {
    fetchCalls++;
    return new Response(
      JSON.stringify({
        error: { message: "Service temporarily unavailable", type: "api_error" },
      }),
      {
        status: 503,
        headers: { "Content-Type": "application/json" },
      }
    );
  }) as typeof fetch;

  try {
    const tweets = Array.from({ length: 40 }).map((_, index) => ({
      id: `tweet_${index}`,
      text: `Solana DeFi alpha ${index}`,
    }));
    const labels = await mod.labelTweetTracks(tweets);

    assert.equal(labels.length, 40);
    assert.equal(fetchCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousApiKey === undefined) {
      delete process.env.AI_API_KEY;
    } else {
      process.env.AI_API_KEY = previousApiKey;
    }
    if (previousTrackAttempts === undefined) {
      delete process.env.AI_TRACK_MAX_ATTEMPTS;
    } else {
      process.env.AI_TRACK_MAX_ATTEMPTS = previousTrackAttempts;
    }
    mod.__resetAiUnavailableCooldownForTests();
  }
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
