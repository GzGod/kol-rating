const TWITTER_API_BASE = "https://api.twitter.com/2";

function getHeaders(): Record<string, string> {
  const token = process.env.TWITTER_BEARER_TOKEN;
  if (!token) throw new Error("TWITTER_BEARER_TOKEN not set");
  return { Authorization: `Bearer ${token}` };
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

export async function lookupUser(username: string): Promise<TwitterUser> {
  const url = `${TWITTER_API_BASE}/users/by/username/${username}?user.fields=description,profile_image_url,public_metrics,created_at`;
  const res = await fetch(url, { headers: getHeaders() });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Twitter API error ${res.status}: ${body}`);
  }
  const json = await res.json();
  if (!json.data) throw new Error(`User @${username} not found`);
  return json.data;
}

export async function getUserTweets(
  userId: string,
  maxResults = 100
): Promise<TwitterTweet[]> {
  const tweets: TwitterTweet[] = [];
  let paginationToken: string | undefined;

  while (tweets.length < maxResults) {
    const batchSize = Math.min(100, maxResults - tweets.length);
    let url = `${TWITTER_API_BASE}/users/${userId}/tweets?max_results=${batchSize}&tweet.fields=created_at,public_metrics,referenced_tweets`;
    if (paginationToken) url += `&pagination_token=${paginationToken}`;

    const res = await fetch(url, { headers: getHeaders() });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Twitter API error ${res.status}: ${body}`);
    }
    const json = await res.json();
    if (!json.data || json.data.length === 0) break;

    tweets.push(...json.data);
    paginationToken = json.meta?.next_token;
    if (!paginationToken) break;

    // Rate limit: 1 req/sec
    await new Promise((r) => setTimeout(r, 1100));
  }

  return tweets.slice(0, maxResults);
}
