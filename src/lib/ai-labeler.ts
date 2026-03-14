const TRACK_TAGS = [
  "L1_L2",
  "DeFi",
  "NFT_Gaming",
  "AI_DePIN",
  "Memecoin",
  "CeFi_Exchange",
  "Macro_Policy",
  "Security_Audit",
  "Infra_Tool",
  "BTC_Ecosystem",
  "RWA",
  "SocialFi",
  "Other",
] as const;

const STYLE_TAGS = [
  "Analyst",
  "Opinion_Leader",
  "News_Curator",
  "Educator",
  "Shill",
  "Community_Builder",
] as const;

const DEFAULT_AI_BASE = "https://max.openai365.top/v1";
const DEFAULT_AI_MODEL = "claude-sonnet-4-6";
const DEFAULT_TIMEOUT_MS = {
  track: 15_000,
  style: 20_000,
} as const;
const DEFAULT_MAX_ATTEMPTS = {
  track: 4,
  style: 4,
} as const;
const DEFAULT_STYLE_RESULT = {
  primary_style: "Analyst" as const,
  reasoning: "默认分类",
};

export type TrackTag = (typeof TRACK_TAGS)[number];
export type StyleTag = (typeof STYLE_TAGS)[number];

type AiTask = "track" | "style";
type ChatMessage = { role: string; content: string };
type TweetInput = { id: string; text: string };

interface TweetLabel {
  id: string;
  tags: TrackTag[];
}

interface StyleResult {
  primary_style: StyleTag;
  secondary_style?: StyleTag;
  reasoning: string;
}

interface AiCompletionOptions {
  task: AiTask;
  timeoutMs?: number;
  maxAttempts?: number;
  model?: string;
}

interface AiCompletionDeps {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  logger?: Pick<Console, "info" | "warn" | "error">;
}

interface LabelKolSignalsInput {
  trackTweets: TweetInput[];
  styleTweets?: TweetInput[];
}

interface LabelKolSignalsDeps {
  labelTracks?: (tweets: TweetInput[]) => Promise<TweetLabel[]>;
  labelStyle?: (tweets: TweetInput[]) => Promise<StyleResult>;
}

class AiRequestError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "AiRequestError";
  }
}

const TRACK_SYNONYMS: Array<{ pattern: RegExp; tag: TrackTag }> = [
  { pattern: /\b(l1|l2|layer ?1|layer ?2|layer2|rollup|rollups|base|arbitrum|optimism|zksync|starknet|solana|ethereum|avalanche|berachain|sui|aptos)\b|公链|二层|扩容|主网/i, tag: "L1_L2" },
  { pattern: /\b(defi|dex|amm|lending|borrow|yield|liquidity|stablecoin|perp|perpetual|uniswap|aave|curve|lido|jupiter|gmx|pendle|morpho|staking)\b|借贷|收益|流动性|稳定币|永续|质押/i, tag: "DeFi" },
  { pattern: /\b(nft|gamefi|gaming|metaverse|collectible|blur|axie|treasure|pudgy)\b|游戏|元宇宙|数字藏品/i, tag: "NFT_Gaming" },
  { pattern: /\b(ai|depin|render|bittensor|tao\b|io\.net|grass|gpu|compute|inference|agent)\b|算力|推理|去中心化物理基础设施/i, tag: "AI_DePIN" },
  { pattern: /\b(meme|memecoin|pumpfun|pump\.fun|doge|pepe|wif|bonk|shib)\b|meme币|社区币|土狗/i, tag: "Memecoin" },
  { pattern: /\b(cefi|cex|exchange|binance|coinbase|okx|bybit|kraken)\b|交易所|上币|下架/i, tag: "CeFi_Exchange" },
  { pattern: /\b(sec|etf|fed|fomc|regulation|regulatory|policy|macro|congress|treasury|interest rate)\b|监管|政策|宏观|美联储|国会|降息/i, tag: "Macro_Policy" },
  { pattern: /\b(security|audit|exploit|hack|rug pull|rugpull|wallet security|vulnerability|phishing)\b|安全|审计|漏洞|被盗|钓鱼/i, tag: "Security_Audit" },
  { pattern: /\b(infra|infrastructure|oracle|wallet|bridge|bridging|tooling|developer tool|sdk|chainlink|metamask|layerzero|rpc)\b|基础设施|钱包|跨链|预言机|开发者工具/i, tag: "Infra_Tool" },
  { pattern: /\b(bitcoin|btc\b|ordinals|brc-20|brc20|runes|lightning network|lightning)\b|比特币生态|铭文|闪电网络/i, tag: "BTC_Ecosystem" },
  { pattern: /\b(rwa|real world asset|real-world asset|treasur(y|ies)|t-bill|tbill|ondo|centrifuge|tokenized asset)\b|真实世界资产|链上国债|美债|合规资产/i, tag: "RWA" },
  { pattern: /\b(socialfi|social fi|social protocol|creator economy|farcaster|lens|friend\.tech|friendtech)\b|社交金融|创作者经济|社交协议/i, tag: "SocialFi" },
];

const NON_WEB3_HINTS = [
  /\b(ramen|tokyo|coffee|travel|vacation|movie|music|birthday|gym|weekend)\b/i,
  /今天吃了|旅游|火锅|奶茶|晚安|早安/,
];

function parsePositiveInt(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function uniqueTags(tags: TrackTag[]): TrackTag[] {
  return [...new Set(tags)].slice(0, 2);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function shouldUseResponsesFallback(status: number, body: string): boolean {
  if (status !== 400) return false;
  const normalized = body.toLowerCase();
  return (
    normalized.includes("unsupported legacy protocol") &&
    normalized.includes("/v1/responses")
  );
}

function toResponsesInput(messages: ChatMessage[]): Array<{ role: string; content: string }> {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));
}

function extractResponsesOutputText(payload: unknown): string | null {
  if (!isRecord(payload)) return null;

  const directOutputText = payload.output_text;
  if (typeof directOutputText === "string" && directOutputText.trim()) {
    return directOutputText.trim();
  }

  const output = payload.output;
  if (Array.isArray(output)) {
    const chunks: string[] = [];

    for (const item of output) {
      if (!isRecord(item)) continue;

      if (typeof item.text === "string" && item.text.trim()) {
        chunks.push(item.text.trim());
      }

      const content = item.content;
      if (!Array.isArray(content)) continue;

      for (const part of content) {
        if (!isRecord(part)) continue;

        if (typeof part.text === "string" && part.text.trim()) {
          chunks.push(part.text.trim());
          continue;
        }

        if (isRecord(part.text) && typeof part.text.value === "string" && part.text.value.trim()) {
          chunks.push(part.text.value.trim());
          continue;
        }

        if (typeof part.output_text === "string" && part.output_text.trim()) {
          chunks.push(part.output_text.trim());
        }
      }
    }

    if (chunks.length > 0) {
      return chunks.join("\n");
    }
  }

  if (isRecord(payload.response)) {
    return extractResponsesOutputText(payload.response);
  }

  return null;
}

function getAiConfig(task: AiTask, options: AiCompletionOptions, deps: AiCompletionDeps) {
  const modelEnv = task === "track" ? process.env.AI_TRACK_MODEL : process.env.AI_STYLE_MODEL;
  const timeoutEnv =
    task === "track" ? process.env.AI_TRACK_TIMEOUT_MS : process.env.AI_STYLE_TIMEOUT_MS;
  const attemptEnv =
    task === "track" ? process.env.AI_TRACK_MAX_ATTEMPTS : process.env.AI_STYLE_MAX_ATTEMPTS;

  return {
    baseUrl: deps.baseUrl || process.env.AI_API_BASE || DEFAULT_AI_BASE,
    apiKey: deps.apiKey || process.env.AI_API_KEY || "",
    model: options.model || deps.model || modelEnv || process.env.AI_MODEL || DEFAULT_AI_MODEL,
    timeoutMs: options.timeoutMs || parsePositiveInt(timeoutEnv) || DEFAULT_TIMEOUT_MS[task],
    maxAttempts:
      options.maxAttempts || parsePositiveInt(attemptEnv) || DEFAULT_MAX_ATTEMPTS[task],
  };
}

function isRetryableError(error: unknown): boolean {
  if (error instanceof AiRequestError) {
    return error.status === 408 || error.status === 409 || error.status === 429 || (error.status ?? 0) >= 500;
  }

  return error instanceof Error && (error.name === "AbortError" || error instanceof TypeError);
}

function getRetryDelayMs(attempt: number): number {
  const exponentialBackoff = 800 * 2 ** (attempt - 1);
  return Math.min(exponentialBackoff, 5_000);
}

export async function runAiChatCompletion(
  messages: ChatMessage[],
  options: AiCompletionOptions,
  deps: AiCompletionDeps = {}
): Promise<string> {
  const fetchImpl = deps.fetchImpl || fetch;
  const sleep = deps.sleep || delay;
  const logger = deps.logger || console;
  const { apiKey, baseUrl, model, timeoutMs, maxAttempts } = getAiConfig(
    options.task,
    options,
    deps
  );

  if (!apiKey) {
    throw new Error("AI_API_KEY is not configured");
  }

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const chatUrl = `${baseUrl}/chat/completions`;
      const response = await fetchImpl(chatUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.2,
          max_tokens: 4096,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();

        if (shouldUseResponsesFallback(response.status, errorBody)) {
          const responsesUrl = `${baseUrl}/responses`;
          const responsesResponse = await fetchImpl(responsesUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            signal: controller.signal,
            body: JSON.stringify({
              model,
              input: toResponsesInput(messages),
              temperature: 0.2,
              max_output_tokens: 4096,
            }),
          });

          if (!responsesResponse.ok) {
            throw new AiRequestError(
              `AI API error ${responsesResponse.status}: ${await responsesResponse.text()}`,
              responsesResponse.status
            );
          }

          const responsesPayload = (await responsesResponse.json()) as unknown;
          const responsesContent = extractResponsesOutputText(responsesPayload);
          if (!responsesContent) {
            throw new Error("AI response missing message content");
          }

          logger.info("AI request completed", {
            task: options.task,
            attempt,
            durationMs: Date.now() - startedAt,
            model,
            protocol: "responses",
          });
          return responsesContent;
        }

        throw new AiRequestError(`AI API error ${response.status}: ${errorBody}`, response.status);
      }

      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = payload.choices?.[0]?.message?.content;
      if (typeof content !== "string" || content.trim() === "") {
        throw new Error("AI response missing message content");
      }

      logger.info("AI request completed", {
        task: options.task,
        attempt,
        durationMs: Date.now() - startedAt,
        model,
        protocol: "chat",
      });
      return content;
    } catch (error) {
      const retryable = attempt < maxAttempts && isRetryableError(error);
      logger.warn("AI request failed", {
        task: options.task,
        attempt,
        durationMs: Date.now() - startedAt,
        model,
        retryable,
        message: error instanceof Error ? error.message : String(error),
      });

      if (!retryable) {
        throw error;
      }

      lastError = error;
      await sleep(getRetryDelayMs(attempt));
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("AI request failed");
}

export function normalizeTrackTags(tags: string[]): TrackTag[] {
  const normalized: TrackTag[] = [];

  for (const rawTag of tags) {
    const tag = rawTag.trim();
    if (!tag) continue;

    if ((TRACK_TAGS as readonly string[]).includes(tag)) {
      normalized.push(tag as TrackTag);
      continue;
    }

    for (const synonym of TRACK_SYNONYMS) {
      if (synonym.pattern.test(tag)) {
        normalized.push(synonym.tag);
        break;
      }
    }
  }

  return uniqueTags(normalized);
}

export function inferTrackTagsFromText(text: string): TrackTag[] {
  const lowered = text.trim();
  if (!lowered) return ["Other"];

  const tags: TrackTag[] = [];
  const isClearlyNonWeb3 = NON_WEB3_HINTS.some((pattern) => pattern.test(lowered));
  for (const synonym of TRACK_SYNONYMS) {
    if (synonym.pattern.test(lowered)) {
      tags.push(synonym.tag);
    }
  }

  const deduped = uniqueTags(tags);
  if (deduped.length > 0) {
    return deduped;
  }

  return isClearlyNonWeb3 ? ["Other"] : ["Other"];
}

export function repairTrackLabelBatch(
  tweets: TweetInput[],
  aiLabels: Array<{ id: string; tags: string[] }>
): TweetLabel[] {
  const aiMap = new Map(aiLabels.map((item) => [item.id, normalizeTrackTags(item.tags)]));

  return tweets.map((tweet) => {
    const fromAi = aiMap.get(tweet.id) || [];
    if (fromAi.length > 0) {
      return { id: tweet.id, tags: fromAi };
    }

    return { id: tweet.id, tags: inferTrackTagsFromText(tweet.text) };
  });
}

function extractJsonArray(raw: string): Array<{ id: string; tags: string[] }> {
  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error("AI output did not contain a JSON array");
  }

  return JSON.parse(jsonMatch[0]) as Array<{ id: string; tags: string[] }>;
}

function extractJsonObject<T>(raw: string): T {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("AI output did not contain a JSON object");
  }

  return JSON.parse(jsonMatch[0]) as T;
}

/** Label tweets with track tags in batches of 10-20 */
export async function labelTweetTracks(tweets: TweetInput[]): Promise<TweetLabel[]> {
  const results: TweetLabel[] = [];
  const batchSize = 20;

  for (let i = 0; i < tweets.length; i += batchSize) {
    const batch = tweets.slice(i, i + batchSize);

    const systemPrompt = `你是一个 Web3 内容分类引擎。你的任务是给推文打赛道标签。

赛道标签列表（只能从以下选择，每条推文选 1-2 个最相关的）：
- L1_L2（公链、Layer2、扩容方案，如 Ethereum、Solana、Arbitrum、Base、zkSync）
- DeFi（去中心化金融、DEX、借贷、收益、流动性、稳定币，如 Uniswap、Aave、Curve、Lido）
- NFT_Gaming（NFT、GameFi、元宇宙、数字收藏品，如 Blur、Axie、Treasure、Pudgy Penguins）
- AI_DePIN（AI+Crypto、去中心化物理基础设施，如 Render、Bittensor、io.net、Grass）
- Memecoin（Meme代币、社区币、PumpFun相关，如 PEPE、DOGE、WIF、BONK）
- CeFi_Exchange（中心化交易所、CeFi产品、交易所公告，如 Binance、Coinbase、OKX、Bybit）
- Macro_Policy（宏观经济、加密监管政策、政府/SEC/国会相关、ETF）
- Security_Audit（安全事件、审计报告、漏洞分析、Rug Pull 分析、钱包安全）
- Infra_Tool（基础设施、开发工具、钱包、预言机、跨链桥，如 Chainlink、MetaMask、LayerZero）
- BTC_Ecosystem（比特币生态、Ordinals、BRC-20、Runes、闪电网络）
- RWA（真实世界资产代币化、链上国债、合规资产，如 Ondo、Centrifuge）
- SocialFi（社交金融、创作者经济、社交协议，如 Farcaster、Lens、friend.tech）
- Other（不属于以上任何类别、纯个人生活、无法判断）

分类原则：
1. 严格使用上述标签名称，不要自创标签
2. 每条推文输出 1-2 个最相关的标签，优先选择最具体的标签
3. 如果一条推文同时涉及两个赛道（如"Solana上的DeFi协议"），两个都标
4. 如果推文内容和 Web3 完全无关（纯个人生活、美食旅游、心灵鸡汤等），标记为 Other
5. 如果推文提到某个项目但主要讨论的是宏观市场趋势，标 Macro_Policy 而非项目所属赛道
6. 如果推文是关于某个代币的价格走势/交易建议而非项目本身，标该代币所属赛道
7. 只输出 JSON，不要输出任何解释、前言或 markdown 格式标记`;

    const userPrompt = `请给以下推文打赛道标签。

推文列表：
${JSON.stringify(batch, null, 2)}

请严格用以下 JSON 格式返回，不要包含任何其他内容：
[
  {"id": "tweet_001", "tags": ["DeFi"]},
  {"id": "tweet_002", "tags": ["L1_L2", "AI_DePIN"]}
]`;

    try {
      const raw = await runAiChatCompletion(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        { task: "track" }
      );

      const parsed = extractJsonArray(raw);
      const repaired = repairTrackLabelBatch(batch, parsed);
      const otherCount = repaired.filter((item) => item.tags[0] === "Other").length;

      console.info("AI track labels repaired", {
        batchSize: batch.length,
        parsedSize: parsed.length,
        otherCount,
      });
      results.push(...repaired);
    } catch (error) {
      console.error("AI track labeling batch error", {
        batchSize: batch.length,
        message: error instanceof Error ? error.message : String(error),
      });
      results.push(...repairTrackLabelBatch(batch, []));
    }
  }

  return results;
}

/** Analyze KOL content style from a batch of tweets */
export async function labelKolStyle(tweets: TweetInput[]): Promise<StyleResult> {
  const sample = tweets.slice(0, 30);

  const systemPrompt = `你是一个 Web3 KOL 内容风格分析引擎。你的任务是根据一组推文判断这个 KOL 的内容风格。

风格标签列表（从以下选择 1-2 个最符合的主风格）：

- Analyst（分析型）
  特征：长推文多、引用数据或链上数据、有论证过程、理性客观、经常写 Thread
  典型内容："从链上数据看，Aave V3的TVL在过去30天增长了47%，主要驱动力是..."

- Opinion_Leader（观点型）
  特征：态度鲜明、善于表达立场、经常参与争论、喜欢发表预判
  典型内容："说实话，这轮牛市的叙事已经从DeFi转向AI了，还在死守DeFi的人该醒醒了"

- News_Curator（新闻搬运型）
  特征：快讯多、第一时间转发信息源、追时效、简短摘要
  典型内容："Breaking: Binance宣布下架XX交易对，24小时后生效"

- Educator（教程型）
  特征：Thread 多、分步骤讲解、科普内容、面向新手、图文并茂
  典型内容："如何在 Arbitrum 上使用 GMX 进行永续合约交易？手把手教程 🧵👇"

- Shill（喊单型）
  特征：频繁提及代币名称和价格、推荐买入、语言情绪化、FOMO 引导
  典型内容："$XX 现在才0.5U，上线头部所后至少10U，还不冲？🚀🚀🚀"

- Community_Builder（社区运营型）
  特征：互动多、经常办 Giveaway/AMA、拉社区、@别人频率高、组织活动
  典型内容："GM fam! 🎉 We're giving away 10 WL spots! Like + RT + Follow to enter!"

判断原则：
1. 选择 1-2 个最符合的风格标签作为主风格
2. 如果两种风格占比接近，都标上，第一个是主风格，第二个是副风格
3. 基于推文整体模式判断，不要因为一两条特殊推文改变结论
4. 给出简短的判断依据（一句话，说明你看到了什么特征）
5. 只输出 JSON，不要输出任何其他内容`;

  const userPrompt = `以下是某个 KOL 最近的推文，请分析该 KOL 的内容风格。

KOL 推文列表：
${JSON.stringify(sample, null, 2)}

请严格用以下 JSON 格式返回，不要包含任何其他内容：
{
  "primary_style": "标签名",
  "secondary_style": "标签名或null",
  "reasoning": "一句话判断依据"
}`;

  try {
    const raw = await runAiChatCompletion(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      { task: "style" }
    );

    const parsed = extractJsonObject<{
      primary_style?: string;
      secondary_style?: string | null;
      reasoning?: string;
    }>(raw);

    const normalizedPrimary = STYLE_TAGS.includes(parsed.primary_style as StyleTag)
      ? (parsed.primary_style as StyleTag)
      : DEFAULT_STYLE_RESULT.primary_style;
    const normalizedSecondary = STYLE_TAGS.includes(parsed.secondary_style as StyleTag)
      ? (parsed.secondary_style as StyleTag)
      : undefined;

    return {
      primary_style: normalizedPrimary,
      secondary_style: normalizedSecondary,
      reasoning: parsed.reasoning?.trim() || DEFAULT_STYLE_RESULT.reasoning,
    };
  } catch (error) {
    console.error("AI style labeling error", {
      message: error instanceof Error ? error.message : String(error),
    });
    return { ...DEFAULT_STYLE_RESULT };
  }
}

export async function labelKolSignals(
  input: LabelKolSignalsInput,
  deps: LabelKolSignalsDeps = {}
): Promise<{ trackLabels: TweetLabel[]; style: StyleResult }> {
  const labelTracks = deps.labelTracks || labelTweetTracks;
  const labelStyle = deps.labelStyle || labelKolStyle;
  const styleTweets = input.styleTweets || input.trackTweets.slice(0, 30);

  const trackPromise =
    input.trackTweets.length > 0 ? labelTracks(input.trackTweets) : Promise.resolve([]);
  const stylePromise =
    styleTweets.length > 0 ? labelStyle(styleTweets) : Promise.resolve({ ...DEFAULT_STYLE_RESULT });

  const [trackLabels, style] = await Promise.all([trackPromise, stylePromise]);
  return { trackLabels, style };
}
