import assert from "node:assert/strict";
import test from "node:test";

test("lookupUser extracts rest_id from nested user_results structure", async () => {
  let mod: {
    lookupUser: (username: string) => Promise<{ id: string; username: string; name: string }>;
  };

  try {
    mod = await import("../src/lib/twitter");
  } catch {
    assert.fail("twitter module missing");
  }

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        data: {
          user: {
            result: {
              data: {
                user_result: {
                  result: {
                    rest_id: "12345",
                    legacy: {
                      screen_name: "xuegaogx",
                      name: "Snow Cake",
                      description: "bio",
                      profile_image_url_https: "https://pbs.twimg.com/profile_images/test_normal.jpg",
                      followers_count: 100,
                      friends_count: 10,
                      statuses_count: 20,
                      created_at: "Fri Mar 13 00:00:00 +0000 2026",
                    },
                  },
                },
              },
            },
          },
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    ) as Response;

  process.env.RAPIDAPI_KEY = "test-key";

  try {
    const user = await mod.lookupUser("xuegaogx");
    assert.equal(user.id, "12345");
    assert.equal(user.username, "xuegaogx");
    assert.equal(user.name, "Snow Cake");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("lookupUser logs payload summary when twitter241 returns unusable user data", async () => {
  let mod: {
    lookupUser: (username: string) => Promise<{ id: string; username: string; name: string }>;
  };

  try {
    mod = await import("../src/lib/twitter");
  } catch {
    assert.fail("twitter module missing");
  }

  const originalFetch = globalThis.fetch;
  const originalConsoleError = console.error;
  const errorCalls: unknown[][] = [];

  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        user: {
          result: {
            note: "unexpected shape",
          },
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    ) as Response;
  console.error = (...args: unknown[]) => {
    errorCalls.push(args);
  };

  process.env.RAPIDAPI_KEY = "test-key";

  try {
    await assert.rejects(
      () => mod.lookupUser("xuegaogx"),
      /Twitter241 user payload missing id\/username for @xuegaogx/
    );
    assert.equal(errorCalls.length, 1);
    assert.equal(errorCalls[0][0], "Twitter241 unexpected user payload");
    assert.deepEqual(errorCalls[0][1], {
      username: "xuegaogx",
      topLevelKeys: ["user"],
      payloadSnippet: '{"user":{"result":{"note":"unexpected shape"}}}',
    });
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalConsoleError;
  }
});
