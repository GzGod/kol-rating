import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { lookupUser } from "@/lib/twitter";
import { processKol } from "@/lib/pipeline";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tier = searchParams.get("tier");
  const track = searchParams.get("track");
  const search = searchParams.get("search");
  const sort = searchParams.get("sort") || "powerScore";
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "20");

  const where: Record<string, unknown> = {};
  if (tier) where.tier = tier;
  if (track) where.primaryTrack = track;
  if (search) {
    where.OR = [
      { username: { contains: search, mode: "insensitive" } },
      { displayName: { contains: search, mode: "insensitive" } },
    ];
  }

  const orderBy: Record<string, string> =
    sort === "followers"
      ? { followerCount: "desc" }
      : sort === "name"
        ? { username: "asc" }
        : { powerScore: "desc" };

  const [kols, total] = await Promise.all([
    prisma.kol.findMany({
      where,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.kol.count({ where }),
  ]);

  return NextResponse.json({ kols, total, page, limit });
}

export async function POST(request: NextRequest) {
  const { username } = await request.json();
  if (!username) {
    return NextResponse.json({ error: "username is required" }, { status: 400 });
  }

  const handle = username.replace("@", "").trim();

  // Check if already exists
  const existing = await prisma.kol.findUnique({ where: { username: handle } });
  if (existing) {
    return NextResponse.json({ error: "KOL already exists", kol: existing }, { status: 409 });
  }

  // Lookup on Twitter
  const user = await lookupUser(handle);

  // Create KOL record
  const kol = await prisma.kol.create({
    data: {
      twitterId: user.id,
      username: user.username,
      displayName: user.name,
      bio: user.description,
      avatarUrl: user.profile_image_url?.replace("_normal", "_400x400"),
      followerCount: user.public_metrics.followers_count,
      followingCount: user.public_metrics.following_count,
      tweetCount: user.public_metrics.tweet_count,
    },
  });

  // Run full pipeline
  try {
    const result = await processKol(kol.id);
    const updated = await prisma.kol.findUnique({ where: { id: kol.id } });
    return NextResponse.json({ kol: updated, score: result }, { status: 201 });
  } catch (e) {
    console.error("Pipeline error:", e);
    // Return KOL even if pipeline fails
    return NextResponse.json({ kol, error: "Pipeline partially failed" }, { status: 201 });
  }
}
