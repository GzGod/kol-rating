const TRACK_TAGS = [
  "L1_L2", "DeFi", "NFT_Gaming", "AI_DePIN", "Memecoin",
  "CeFi_Exchange", "Macro_Policy", "Security_Audit", "Infra_Tool",
  "BTC_Ecosystem", "Other",
] as const;

const STYLE_TAGS = [
  "Analyst", "Opinion_Leader", "News_Curator",
  "Educator", "Shill", "Community_Builder",
] as const;

export type TrackTag = (typeof TRACK_TAGS)[number];
export type StyleTag = (typeof STYLE_TAGS)[number];

interface TweetLabel {
  id: string;
  tags: TrackTag[];
}

interface StyleResult {
  primary_style: StyleTag;
  secondary_style?: StyleTag;
  reasoning: string;
}

async function callAI(messages: { role: string; content: string }[]): Promise<string> {
  const base = process.env.AI_API_BASE || "https://max.openai365.top/v1";
  const model = process.env.AI_MODEL || "claude-sonnet-4-6";

  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.AI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.3,
      max_tokens: 4096,
    }),
  });

  if (!res.ok) throw new Error(`AI API error ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return json.choices[0].message.content;
}

/** Label tweets with track tags in batches of 20 */
export async function labelTweetTracks(
  tweets: { id: string; text: string }[]
): Promise<TweetLabel[]> {
  const results: TweetLabel[] = [];
  const batchSize = 20;

  for (let i = 0; i < tweets.length; i += batchSize) {
    const batch = tweets.slice(i, i + batchSize);

    const systemPrompt = `你是一个 Web3 内容分类引擎。给推文打赛道标签。

赛道标签列表（每条推文选 1-2 个最相关的）：
- L1_L2（公链、Layer2、扩容方案）
- DeFi（去中心化金融、DEX、借贷、收益）
- NFT_Gaming（NFT、GameFi、元宇宙）
- AI_DePIN（AI+Crypto、去中心化物理基础设施）
- Memecoin（Meme代币、社区币）
- CeFi_Exchange（中心化交易所、CeFi产品）
- Macro_Policy（宏观经济、监管政策）
- Security_Audit（安全事件、审计、漏洞分析）
- Infra_Tool（基础设施、开发工具、钱包、预言机）
- BTC_Ecosystem（比特币生态、Ordinals、BRC-20）
- Other（不属于以上任何类别）

规则：严格使用上述标签名称。只输出 JSON 数组，不要输出任何解释。`;

    const userPrompt = `请给以下推文打赛道标签。

推文列表：
${JSON.stringify(batch, null, 2)}

请用以下 JSON 格式返回：
[{"id": "xxx", "tags": ["DeFi"]}, ...]`;

    try {
      const raw = await callAI([
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ]);

      // Extract JSON from response
      const jsonMatch = raw.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed: TweetLabel[] = JSON.parse(jsonMatch[0]);
        // Validate tags
        for (const item of parsed) {
          item.tags = item.tags.filter((t) => TRACK_TAGS.includes(t as TrackTag)) as TrackTag[];
          if (item.tags.length === 0) item.tags = ["Other"];
        }
        results.push(...parsed);
      }
    } catch (e) {
      console.error(`AI labeling batch error:`, e);
      // Fallback: mark as Other
      results.push(...batch.map((t) => ({ id: t.id, tags: ["Other" as TrackTag] })));
    }

    // Rate limit between batches
    if (i + batchSize < tweets.length) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  return results;
}

/** Analyze KOL content style from a batch of tweets */
export async function labelKolStyle(
  tweets: { id: string; text: string }[]
): Promise<StyleResult> {
  const sample = tweets.slice(0, 30);

  const systemPrompt = `你是一个 Web3 KOL 内容风格分析引擎。根据一组推文判断 KOL 的内容风格。

风格标签列表（选 1-2 个最符合的）：
- Analyst（分析型）：长推文多、引用数据、有论证过程
- Opinion_Leader（观点型）：态度鲜明、善于表达立场
- News_Curator（新闻搬运型）：快讯多、追时效
- Educator（教程型）：Thread 多、分步骤讲解
- Shill（喊单型）：频繁提及代币和价格、推荐买入
- Community_Builder（社区运营型）：互动多、办 Giveaway/AMA

只输出 JSON，不要输出任何解释。`;

  const userPrompt = `以下是某个 KOL 最近的推文，请分析内容风格。

推文列表：
${JSON.stringify(sample, null, 2)}

请用以下 JSON 格式返回：
{"primary_style": "Analyst", "secondary_style": "Opinion_Leader", "reasoning": "一句话判断依据"}`;

  try {
    const raw = await callAI([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ]);

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as StyleResult;
      // Validate
      if (!STYLE_TAGS.includes(parsed.primary_style)) parsed.primary_style = "Analyst";
      if (parsed.secondary_style && !STYLE_TAGS.includes(parsed.secondary_style)) {
        delete parsed.secondary_style;
      }
      return parsed;
    }
  } catch (e) {
    console.error("AI style labeling error:", e);
  }

  return { primary_style: "Analyst", reasoning: "默认分类" };
}
