import { prisma } from "@/lib/prisma";
import { lookupUser, getUserTweets } from "@/lib/twitter";
import { labelTweetTracks, labelKolStyle } from "@/lib/ai-labeler";
import { calculatePowerScore } from "@/lib/score/calculator";

/** Full pipeline: fetch Twitter data → AI label → calculate score */
export async function processKol(kolId: string) {
  const kol = await prisma.kol.findUniqueOrThrow({ where: { id: kolId } });

  // 1. Fetch latest user data
  const user = await lookupUser(kol.username);
  await prisma.kol.update({
    where: { id: kolId },
    data: {
      displayName: user.name,
      bio: user.description,
      avatarUrl: user.profile_image_url?.replace("_normal", "_400x400"),
      followerCount: user.public_metrics.followers_count,
      followingCount: user.public_metrics.following_count,
      tweetCount: user.public_metrics.tweet_count,
    },
  });

  // Record follower snapshot
  await prisma.followerSnapshot.create({
    data: { kolId, count: user.public_metrics.followers_count },
  });

  // 2. Fetch tweets (up to 100)
  const rawTweets = await getUserTweets(user.id, 100);

  // Upsert tweets
  for (const t of rawTweets) {
    const isRetweet = t.referenced_tweets?.some((r) => r.type === "retweeted") ?? false;
    const isReply = t.referenced_tweets?.some((r) => r.type === "replied_to") ?? false;
    const isQuote = t.referenced_tweets?.some((r) => r.type === "quoted") ?? false;

    await prisma.tweet.upsert({
      where: { tweetId: t.id },
      create: {
        tweetId: t.id,
        kolId,
        text: t.text,
        isRetweet,
        isReply,
        isQuote,
        likeCount: t.public_metrics.like_count,
        retweetCount: t.public_metrics.retweet_count,
        replyCount: t.public_metrics.reply_count,
        quoteCount: t.public_metrics.quote_count,
        impressionCount: t.public_metrics.impression_count || 0,
        publishedAt: new Date(t.created_at),
      },
      update: {
        likeCount: t.public_metrics.like_count,
        retweetCount: t.public_metrics.retweet_count,
        replyCount: t.public_metrics.reply_count,
        quoteCount: t.public_metrics.quote_count,
        impressionCount: t.public_metrics.impression_count || 0,
      },
    });
  }

  // 3. AI label tweets (only original, non-labeled ones)
  const unlabeledTweets = await prisma.tweet.findMany({
    where: { kolId, trackTags: { isEmpty: true }, isRetweet: false },
    select: { id: true, tweetId: true, text: true },
    take: 100,
  });

  if (unlabeledTweets.length > 0) {
    const labels = await labelTweetTracks(
      unlabeledTweets.map((t) => ({ id: t.tweetId, text: t.text }))
    );

    for (const label of labels) {
      await prisma.tweet.updateMany({
        where: { tweetId: label.id },
        data: { trackTags: label.tags },
      });
    }
  }

  // 4. AI style label
  const recentTweets = await prisma.tweet.findMany({
    where: { kolId, isRetweet: false },
    select: { tweetId: true, text: true },
    orderBy: { publishedAt: "desc" },
    take: 30,
  });

  if (recentTweets.length > 0) {
    const style = await labelKolStyle(
      recentTweets.map((t) => ({ id: t.tweetId, text: t.text }))
    );
    await prisma.kol.update({
      where: { id: kolId },
      data: {
        primaryStyle: style.primary_style,
        secondaryStyle: style.secondary_style || null,
        styleReasoning: style.reasoning,
      },
    });
  }

  // 5. Calculate Power Score
  const result = await calculatePowerScore(kolId);

  await prisma.kol.update({
    where: { id: kolId },
    data: { lastFetchedAt: new Date() },
  });

  return result;
}
