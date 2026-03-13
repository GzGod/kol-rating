const RAPIDAPI_HOST = "twitter241.p.rapidapi.com";

function getHeaders(): Record<string, string> {
  const key = process.env.RAPIDAPI_KEY;
  if (!key) throw new Error("RAPIDAPI_KEY not set");
  return {
    "x-rapidapi-key": key,
    "x-rapidapi-host": RAPIDAPI_HOST,
    "Content-Type": "application/json",
  };
}

export interface TwitterUser {
  id: string;
  name: string;
  username: string;
  description: string;
  profile_image_url: string;
  public_metrics: {
    followers_count: number;
    following_count: number;
    tweet_count: number;
  };
  created_at: string;
}

export interface TwitterTweet {
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
  referenced_tweets?: { type: "retweeted" | "replied_to" | "quoted"; id: string }[];
}

// --- Helper: extract user from RapidAPI response ---
function extractUser(result: Record<string, unknown>): TwitterUser {
  // twitter241 returns nested Twitter GraphQL format
  // result.result.legacy has the user data
  const r = result as Record<string, unknown>;
  const userResult = (r.result || r) as Record<string, unknown>;
  const legacy = userResult.legacy as Record<string, unknown> || {};
  const restId = (userResult.rest_id || legacy.id_str || "") as string;

  return {
    id: restId,
    name: (legacy.name || "") as string,
    username: (legacy.screen_name || "") as string,
    description: (legacy.description || "") as string,
    profile_image_url: ((legacy.profile_image_url_https || "") as string).replace("_normal", "_400x400"),
    public_metrics: {
      followers_count: (legacy.followers_count || 0) as number,
      following_count: (legacy.friends_count || 0) as number,
      tweet_count: (legacy.statuses_count || 0) as number,
    },
    created_at: (legacy.created_at || "") as string,
  };
}

// --- Helper: extract tweet from RapidAPI response ---
function extractTweet(entry: Record<string, unknown>): TwitterTweet | null {
  try {
    // Navigate nested GraphQL structure
    const content = entry.content as Record<string, unknown> | undefined;
    const itemContent = (content?.itemContent || entry.itemContent || entry) as Record<string, unknown>;
    const tweetResults = (itemContent?.tweet_results || itemContent) as Record<string, unknown>;
    const result = (tweetResults?.result || tweetResults) as Record<string, unknown>;
    const legacy = result.legacy as Record<string, unknown>;

    if (!legacy) return null;

    const restId = (result.rest_id || legacy.id_str || "") as string;
    const fullText = (legacy.full_text || legacy.text || "") as string;
    const createdAt = (legacy.created_at || "") as string;

    // Views / impressions
    const views = result.views as Record<string, unknown> | undefined;
    const impressionCount = parseInt((views?.count || "0") as string, 10) || 0;

    // Detect retweet / reply / quote
    const retweetedStatus = legacy.retweeted_status_result as Record<string, unknown> | undefined;
    const inReplyTo = legacy.in_reply_to_status_id_str as string | undefined;
    const isQuoteStatus = legacy.is_quote_status as boolean | undefined;
    const quotedStatus = result.quoted_status_result as Record<string, unknown> | undefined;

    const referencedTweets: { type: "retweeted" | "replied_to" | "quoted"; id: string }[] = [];
    if (retweetedStatus) referencedTweets.push({ type: "retweeted", id: "" });
    if (inReplyTo) referencedTweets.push({ type: "replied_to", id: inReplyTo });
    if (isQuoteStatus || quotedStatus) referencedTweets.push({ type: "quoted", id: "" });

    return {
      id: restId,
      text: fullText,
      created_at: createdAt,
      public_metrics: {
        like_count: (legacy.favorite_count || 0) as number,
        retweet_count: (legacy.retweet_count || 0) as number,
        reply_count: (legacy.reply_count || 0) as number,
        quote_count: (legacy.quote_count || 0) as number,
        impression_count: impressionCount,
      },
      referenced_tweets: referencedTweets.length > 0 ? referencedTweets : undefined,
    };
  } catch {
    return null;
  }
}

export async function lookupUser(username: string): Promise<TwitterUser> {
  const url = `https://${RAPIDAPI_HOST}/user?username=${encodeURIComponent(username)}`;
  const res = await fetch(url, { headers: getHeaders() });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Twitter241 API error ${res.status}: ${body}`);
  }
  const json = await res.json();

  // twitter241 returns { result: { ... } } or { data: { user: { result: { ... } } } }
  const userObj = json.result || json.data?.user?.result || json;
  return extractUser(userObj);
}

export async function getUserTweets(
  userId: string,
  maxResults = 100
): Promise<TwitterTweet[]> {
  const tweets: TwitterTweet[] = [];
  let cursor: string | undefined;

  while (tweets.length < maxResults) {
    const count = Math.min(40, maxResults - tweets.length);
    let url = `https://${RAPIDAPI_HOST}/user-tweets?user=${userId}&count=${count}`;
    if (cursor) url += `&cursor=${encodeURIComponent(cursor)}`;

    const res = await fetch(url, { headers: getHeaders() });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Twitter241 API error ${res.status}: ${body}`);
    }
    const json = await res.json();

    // Extract entries from timeline
    const instructions = json.result?.timeline?.instructions
      || json.data?.user?.result?.timeline_v2?.timeline?.instructions
      || [];

    let entries: Record<string, unknown>[] = [];
    for (const inst of instructions) {
      const i = inst as Record<string, unknown>;
      if (i.type === "TimelineAddEntries" || i.entries) {
        entries = (i.entries || []) as Record<string, unknown>[];
        break;
      }
    }

    let newCursor: string | undefined;
    let addedCount = 0;

    for (const entry of entries) {
      const entryId = (entry.entryId || "") as string;

      // Cursor entries for pagination
      if (entryId.startsWith("cursor-bottom")) {
        const content = entry.content as Record<string, unknown> | undefined;
        newCursor = (content?.value || "") as string;
        continue;
      }

      // Tweet entries
      if (entryId.startsWith("tweet-")) {
        const tweet = extractTweet(entry);
        if (tweet && tweet.id) {
          tweets.push(tweet);
          addedCount++;
        }
      }
    }

    cursor = newCursor;
    if (!cursor || addedCount === 0) break;

    // Rate limit
    await new Promise((r) => setTimeout(r, 1100));
  }

  return tweets.slice(0, maxResults);
}
