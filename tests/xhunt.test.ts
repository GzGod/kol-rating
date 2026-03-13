import assert from "node:assert/strict";
import test from "node:test";

test("parseXHuntRankPayload prefers Chinese community rank from official XClaw response", async () => {
  let mod: {
    parseXHuntRankPayload: (payload: unknown, username: string) => number | null;
  };

  try {
    mod = await import("../src/lib/xhunt");
  } catch {
    assert.fail("xhunt module missing");
  }

  const rank = mod.parseXHuntRankPayload(
    {
      kolCnRank: 128,
      kolGlobalRank: 2048,
      kolRank: 32,
    },
    "xuegaogx"
  );

  assert.equal(rank, 128);
});

test("fetchXHuntRank calls the official XClaw rank endpoint with API key auth", async () => {
  let mod: {
    fetchXHuntRank: (
      username: string,
      fetchImpl?: typeof fetch
    ) => Promise<{ available: boolean; blocked: boolean; rank: number | null; status: string }>;
  };

  try {
    mod = await import("../src/lib/xhunt");
  } catch {
    assert.fail("xhunt module missing");
  }

  const previousApiKey = process.env.XCLAW_API_KEY;
  process.env.XCLAW_API_KEY = "test-xclaw-key";

  let requestUrl = "";
  let requestInit: RequestInit | undefined;

  try {
    const result = await mod.fetchXHuntRank(
      "xuegaogx",
      async (input, init) => {
        requestUrl = typeof input === "string" ? input : input.toString();
        requestInit = init;
        return new Response(JSON.stringify({ kolCnRank: 428, kolRank: 22 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }) as Response;
      }
    );

    assert.equal(requestUrl, "https://pro.xclaw.info/data/rank");
    assert.equal(requestInit?.method, "POST");
    assert.equal((requestInit?.headers as Record<string, string>)["X-API-KEY"], "test-xclaw-key");
    assert.equal((requestInit?.headers as Record<string, string>)["Content-Type"], "application/json");
    assert.deepEqual(JSON.parse(String(requestInit?.body)), { handle: "xuegaogx" });
    assert.equal(result.available, true);
    assert.equal(result.rank, 428);
    assert.equal(result.status, "ok");
  } finally {
    if (previousApiKey === undefined) {
      delete process.env.XCLAW_API_KEY;
    } else {
      process.env.XCLAW_API_KEY = previousApiKey;
    }
  }
});

test("fetchXHuntRank returns unavailable without an official XClaw API key", async () => {
  let mod: {
    fetchXHuntRank: (
      username: string,
      fetchImpl?: typeof fetch
    ) => Promise<{ available: boolean; blocked: boolean; rank: number | null; status: string; note: string | null }>;
  };

  try {
    mod = await import("../src/lib/xhunt");
  } catch {
    assert.fail("xhunt module missing");
  }

  const previousApiKey = process.env.XCLAW_API_KEY;
  delete process.env.XCLAW_API_KEY;

  let fetchCalled = false;

  try {
    const result = await mod.fetchXHuntRank("xuegaogx", async () => {
      fetchCalled = true;
      throw new Error("fetch should not run without API key");
    });

    assert.equal(fetchCalled, false);
    assert.equal(result.available, false);
    assert.equal(result.rank, null);
    assert.equal(result.status, "unavailable");
    assert.equal(result.note, "XClaw API key missing");
  } finally {
    if (previousApiKey === undefined) {
      delete process.env.XCLAW_API_KEY;
    } else {
      process.env.XCLAW_API_KEY = previousApiKey;
    }
  }
});

test("evaluateCrossValidation returns certified for high rank and high current power", async () => {
  let mod: {
    evaluateCrossValidation: (input: {
      rank: number | null;
      available: boolean;
      powerScore: number;
      tier: string;
    }) => { status: string; label: string; subLabel: string | null };
  };

  try {
    mod = await import("../src/lib/xhunt");
  } catch {
    assert.fail("xhunt module missing");
  }

  const verdict = mod.evaluateCrossValidation({
    rank: 188,
    available: true,
    powerScore: 78,
    tier: "A",
  });

  assert.equal(verdict.status, "certified");
  assert.equal(verdict.label, "实力认证");
  assert.equal(verdict.subLabel, null);
});

test("evaluateCrossValidation returns dormant legacy for top XHunt rank with weak power tier", async () => {
  let mod: {
    evaluateCrossValidation: (input: {
      rank: number | null;
      available: boolean;
      powerScore: number;
      tier: string;
    }) => { status: string; label: string; subLabel: string | null };
  };

  try {
    mod = await import("../src/lib/xhunt");
  } catch {
    assert.fail("xhunt module missing");
  }

  const verdict = mod.evaluateCrossValidation({
    rank: 90,
    available: true,
    powerScore: 58,
    tier: "B",
  });

  assert.equal(verdict.status, "legacy_slipping");
  assert.equal(verdict.label, "待激活");
  assert.equal(verdict.subLabel, "大将低迷");
});

test("evaluateCrossValidation returns rising star for strong power tier without XHunt rank", async () => {
  let mod: {
    evaluateCrossValidation: (input: {
      rank: number | null;
      available: boolean;
      powerScore: number;
      tier: string;
    }) => { status: string; label: string; subLabel: string | null };
  };

  try {
    mod = await import("../src/lib/xhunt");
  } catch {
    assert.fail("xhunt module missing");
  }

  const verdict = mod.evaluateCrossValidation({
    rank: null,
    available: true,
    powerScore: 88,
    tier: "S",
  });

  assert.equal(verdict.status, "rising_star");
  assert.equal(verdict.label, "潜力新星");
  assert.equal(verdict.subLabel, "强势新人");
});

test("enrichLookupWithXHunt attaches xhunt metadata and validation verdict", async () => {
  let mod: {
    enrichLookupWithXHunt: <T extends {
      kol: { powerScore: number; tier: string };
      cached: boolean;
      trackDistribution: unknown[];
    }>(result: T, xhunt: {
      available: boolean;
      blocked: boolean;
      rank: number | null;
      status: string;
      source: string;
      note: string | null;
    }) => T & {
      xhunt: { rank: number | null; available: boolean; blocked: boolean; status: string };
      crossValidation: { label: string; status: string };
    };
  };

  try {
    mod = await import("../src/lib/xhunt");
  } catch {
    assert.fail("xhunt module missing");
  }

  const enriched = mod.enrichLookupWithXHunt(
    {
      kol: {
        powerScore: 72,
        tier: "A",
      },
      cached: false,
      trackDistribution: [],
    },
    {
      available: true,
      blocked: false,
      rank: 320,
      status: "ok",
      source: "live",
      note: null,
    }
  );

  assert.equal(enriched.xhunt.rank, 320);
  assert.equal(enriched.crossValidation.status, "certified");
  assert.equal(enriched.crossValidation.label, "实力认证");
});
