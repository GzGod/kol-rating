const XAPI_DEFAULT_ACTION_HOST = "action.xapi.to";
const XAPI_ACTION_EXECUTE_PATH = "/v1/actions/execute";

type ActionInput = Record<string, unknown>;
type ReferenceTweetType = "retweeted" | "replied_to" | "quoted";

interface XapiActionResponse {
  success?: boolean;
  data?: unknown;
  error?: unknown;
  message?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function getTopLevelKeys(value: unknown): string[] {
  return isRecord(value) ? Object.keys(value).slice(0, 20) : [];
}

function getPayloadSnippet(value: unknown, maxLength = 1200): string {
  try {
    const serialized = JSON.stringify(value);
    if (!serialized) return "";
    return serialized.length > maxLength ? `${serialized.slice(0, maxLength)}...` : serialized;
  } catch {
    return "[unserializable payload]";
  }
}

function getXapiActionHost(): string {
  return process.env.XAPI_ACTION_HOST?.trim() || XAPI_DEFAULT_ACTION_HOST;
}

function getXapiApiKey(): string {
  const key = process.env.XAPI_API_KEY?.trim();
  if (key) return key;

  // Backward compatibility for existing deployments.
  const legacyKey = process.env.RAPIDAPI_KEY?.trim();
  if (legacyKey) return legacyKey;

  throw new Error("XAPI_API_KEY not set");
}

function buildExecuteUrl(): string {
  const host = getXapiActionHost();
  const protocol =
    host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https";
  return `${protocol}://${host}${XAPI_ACTION_EXECUTE_PATH}`;
}

function getHeaders(): Record<string, string> {
  return {
    "XAPI-Key": getXapiApiKey(),
    "Content-Type": "application/json",
  };
}

function getErrorMessageFromPayload(payload: unknown): string {
  if (typeof payload === "string" && payload.trim()) return payload.trim();
  if (!isRecord(payload)) return "";

  const fields = ["message", "msg", "error"];
  for (const field of fields) {
    const value = payload[field];
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  if (isRecord(payload.data)) {
    for (const field of fields) {
      const value = payload.data[field];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }

  return "";
}

async function executeXapiAction(actionId: string, input: ActionInput): Promise<unknown> {
  const url = buildExecuteUrl();
  const res = await fetch(url, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({
      action_id: actionId,
      input,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error("XAPI twitter action request failed", {
      actionId,
      status: res.status,
      bodySnippet: body.length > 1200 ? `${body.slice(0, 1200)}...` : body,
    });
    throw new Error(`XAPI Twitter API error ${res.status}: ${body}`);
  }

  const payload = (await res.json()) as XapiActionResponse;
  if (payload.success === false) {
    const message = getErrorMessageFromPayload(payload) || "XAPI action execution failed";
    console.error("XAPI twitter action execution failed", {
      actionId,
      message,
      payloadSnippet: getPayloadSnippet(payload),
    });
    throw new Error(`XAPI Twitter API error: ${message}`);
  }

  return payload.data;
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
  referenced_tweets?: { type: ReferenceTweetType; id: string }[];
}

function extractUser(payload: unknown): TwitterUser {
  const data = isRecord(payload) ? payload : {};

  const avatar = asString(data.avatar).replace("_normal", "_400x400");
  return {
    id: asString(data.rest_id),
    name: asString(data.name),
    username: asString(data.screen_name),
    description: asString(data.description),
    profile_image_url: avatar,
    public_metrics: {
      followers_count: toNumber(data.followers_count),
      following_count: toNumber(data.friends_count),
      tweet_count: toNumber(data.statuses_count),
    },
    created_at: asString(data.created_at),
  };
}

function extractReferencedTweets(tweet: Record<string, unknown>): TwitterTweet["referenced_tweets"] {
  const referenced: Array<{ type: ReferenceTweetType; id: string }> = [];

  const retweeted = isRecord(tweet.retweeted_tweet) ? tweet.retweeted_tweet : null;
  if (tweet.is_retweet === true || retweeted) {
    referenced.push({ type: "retweeted", id: retweeted ? asString(retweeted.id) : "" });
  }

  const inReplyToId = asString(tweet.in_reply_to_status_id);
  if (inReplyToId) {
    referenced.push({ type: "replied_to", id: inReplyToId });
  }

  const quoted = isRecord(tweet.quoted_tweet) ? tweet.quoted_tweet : null;
  if (tweet.is_quote_status === true || quoted) {
    referenced.push({ type: "quoted", id: quoted ? asString(quoted.id) : "" });
  }

  return referenced.length > 0 ? referenced : undefined;
}

function extractTweet(tweetPayload: unknown): TwitterTweet | null {
  if (!isRecord(tweetPayload)) return null;

  const id = asString(tweetPayload.id);
  if (!id) return null;

  return {
    id,
    text: asString(tweetPayload.full_text) || asString(tweetPayload.text),
    created_at: asString(tweetPayload.created_at),
    public_metrics: {
      like_count: toNumber(tweetPayload.favorite_count),
      retweet_count: toNumber(tweetPayload.retweet_count),
      reply_count: toNumber(tweetPayload.reply_count),
      quote_count: toNumber(tweetPayload.quote_count),
      impression_count: toNumber(tweetPayload.views_count),
    },
    referenced_tweets: extractReferencedTweets(tweetPayload),
  };
}

export async function lookupUser(username: string): Promise<TwitterUser> {
  const payload = await executeXapiAction("twitter.user_by_screen_name", {
    screen_name: username,
  });

  const user = extractUser(payload);
  if (!user.id || !user.username) {
    console.error("XAPI unexpected user payload", {
      username,
      topLevelKeys: getTopLevelKeys(payload),
      payloadSnippet: getPayloadSnippet(payload),
    });
    throw new Error(`XAPI user payload missing id/username for @${username}`);
  }

  return user;
}

export async function getUserTweets(userId: string, maxResults = 100): Promise<TwitterTweet[]> {
  if (!userId.trim()) {
    throw new Error("XAPI userId is empty");
  }

  const count = Math.max(1, Math.min(100, maxResults));
  const payload = await executeXapiAction("twitter.user_tweets", {
    user_id: userId,
    count,
  });

  const data = isRecord(payload) ? payload : {};
  const tweetsRaw = Array.isArray(data.tweets) ? data.tweets : [];
  const tweets = tweetsRaw
    .map((tweet) => extractTweet(tweet))
    .filter((tweet): tweet is TwitterTweet => tweet !== null);

  return tweets.slice(0, maxResults);
}
