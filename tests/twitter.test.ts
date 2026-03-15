import assert from "node:assert/strict";
import test from "node:test";

test("lookupUser maps xapi twitter.user_by_screen_name response", async () => {
  const mod = await import("../src/lib/twitter");

  const previousXapiKey = process.env.XAPI_API_KEY;
  const originalFetch = globalThis.fetch;
  process.env.XAPI_API_KEY = "test-key";

  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input.toString();
    assert.equal(url, "https://action.xapi.to/v1/actions/execute");

    const headers = new Headers(init?.headers);
    assert.equal(headers.get("XAPI-Key"), "test-key");

    const body = JSON.parse(String(init?.body ?? "{}")) as {
      action_id?: string;
      input?: Record<string, unknown>;
    };
    assert.equal(body.action_id, "twitter.user_by_screen_name");
    assert.equal(body.input?.screen_name, "xuegaogx");

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          rest_id: "1710490876487815168",
          screen_name: "Xuegaogx",
          name: "Snow Cake",
          description: "bio",
          avatar: "https://pbs.twimg.com/profile_images/test_normal.jpg",
          followers_count: 100,
          friends_count: 10,
          statuses_count: 20,
          created_at: "Fri Mar 13 00:00:00 +0000 2026",
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    ) as Response;
  };

  try {
    const user = await mod.lookupUser("xuegaogx");
    assert.equal(user.id, "1710490876487815168");
    assert.equal(user.username, "Xuegaogx");
    assert.equal(user.name, "Snow Cake");
    assert.equal(
      user.profile_image_url,
      "https://pbs.twimg.com/profile_images/test_400x400.jpg"
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (previousXapiKey === undefined) {
      delete process.env.XAPI_API_KEY;
    } else {
      process.env.XAPI_API_KEY = previousXapiKey;
    }
  }
});

test("lookupUser logs payload summary when xapi returns unusable user data", async () => {
  const mod = await import("../src/lib/twitter");

  const previousXapiKey = process.env.XAPI_API_KEY;
  const originalFetch = globalThis.fetch;
  const originalConsoleError = console.error;
  const errorCalls: unknown[][] = [];
  process.env.XAPI_API_KEY = "test-key";

  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        success: true,
        data: {
          note: "unexpected shape",
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    ) as Response;

  console.error = (...args: unknown[]) => {
    errorCalls.push(args);
  };

  try {
    await assert.rejects(
      () => mod.lookupUser("xuegaogx"),
      /XAPI user payload missing id\/username for @xuegaogx/
    );
    assert.equal(errorCalls.length, 1);
    assert.equal(errorCalls[0][0], "XAPI unexpected user payload");
    assert.deepEqual(errorCalls[0][1], {
      username: "xuegaogx",
      topLevelKeys: ["note"],
      payloadSnippet: '{"note":"unexpected shape"}',
    });
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalConsoleError;
    if (previousXapiKey === undefined) {
      delete process.env.XAPI_API_KEY;
    } else {
      process.env.XAPI_API_KEY = previousXapiKey;
    }
  }
});

test("getUserTweets maps xapi twitter.user_tweets response", async () => {
  const mod = await import("../src/lib/twitter");

  const previousXapiKey = process.env.XAPI_API_KEY;
  const originalFetch = globalThis.fetch;
  process.env.XAPI_API_KEY = "test-key";

  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as {
      action_id?: string;
      input?: Record<string, unknown>;
    };
    assert.equal(body.action_id, "twitter.user_tweets");
    assert.equal(body.input?.user_id, "1710490876487815168");
    assert.equal(body.input?.count, 2);

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          tweets: [
            {
              id: "tweet-1",
              full_text: "hello world",
              created_at: "Fri Mar 13 00:00:00 +0000 2026",
              favorite_count: 11,
              retweet_count: 2,
              reply_count: 3,
              quote_count: 4,
              views_count: 999,
              is_quote_status: true,
              quoted_tweet: { id: "quoted-1" },
            },
            {
              id: "tweet-2",
              full_text: "retweet sample",
              created_at: "Fri Mar 12 00:00:00 +0000 2026",
              favorite_count: 0,
              retweet_count: 0,
              reply_count: 0,
              quote_count: 0,
              views_count: 12,
              is_retweet: true,
              retweeted_tweet: { id: "retweet-1" },
              in_reply_to_status_id: "reply-1",
            },
          ],
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    ) as Response;
  };

  try {
    const tweets = await mod.getUserTweets("1710490876487815168", 2);
    assert.equal(tweets.length, 2);
    assert.deepEqual(tweets[0], {
      id: "tweet-1",
      text: "hello world",
      created_at: "Fri Mar 13 00:00:00 +0000 2026",
      public_metrics: {
        like_count: 11,
        retweet_count: 2,
        reply_count: 3,
        quote_count: 4,
        impression_count: 999,
      },
      referenced_tweets: [{ type: "quoted", id: "quoted-1" }],
    });
    assert.deepEqual(tweets[1], {
      id: "tweet-2",
      text: "retweet sample",
      created_at: "Fri Mar 12 00:00:00 +0000 2026",
      public_metrics: {
        like_count: 0,
        retweet_count: 0,
        reply_count: 0,
        quote_count: 0,
        impression_count: 12,
      },
      referenced_tweets: [
        { type: "retweeted", id: "retweet-1" },
        { type: "replied_to", id: "reply-1" },
      ],
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (previousXapiKey === undefined) {
      delete process.env.XAPI_API_KEY;
    } else {
      process.env.XAPI_API_KEY = previousXapiKey;
    }
  }
});
