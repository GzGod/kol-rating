import type {
  CrossValidationVerdict,
  LookupResponse,
  XHuntLookupSummary,
} from "@/lib/lookup-types";

const XHUNT_PUBLIC_PREFIX = "https://kb.cryptohunt.ai/api/xhunt/proxy/public";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeUsername(value: string): string {
  return value.replace(/^@/, "").trim().toLowerCase();
}

function parsePositiveRank(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.trunc(value);
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return null;
}

function getBodySnippet(body: string, maxLength = 400): string {
  return body.length > maxLength ? `${body.slice(0, maxLength)}...` : body;
}

export function parseXHuntRankPayload(payload: unknown, username: string): number | null {
  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername) return null;

  const queue: unknown[] = [payload];
  const visited = new Set<object>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }

    if (!isRecord(current)) continue;
    if (visited.has(current)) continue;
    visited.add(current);

    const currentUsername =
      typeof current.username === "string" ? normalizeUsername(current.username) : "";
    const currentRank = parsePositiveRank(current.kolRank);

    if (currentUsername === normalizedUsername && currentRank !== null) {
      return currentRank;
    }

    for (const nested of Object.values(current)) {
      if (typeof nested === "object" && nested !== null) {
        queue.push(nested);
      }
    }
  }

  return null;
}

export async function fetchXHuntRank(
  username: string,
  fetchImpl: typeof fetch = fetch
): Promise<XHuntLookupSummary> {
  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername) {
    return {
      rank: null,
      available: false,
      blocked: false,
      status: "unavailable",
      source: "live",
      note: "XHunt username missing",
    };
  }

  const url = `${XHUNT_PUBLIC_PREFIX}/fetch/twitter/rank?usernames=${encodeURIComponent(
    normalizedUsername
  )}&target=k8s_kota`;

  try {
    const response = await fetchImpl(url, {
      headers: {
        accept: "application/json, text/plain, */*",
      },
    });

    const body = await response.text();
    const contentType = response.headers.get("content-type") || "";
    const responseUrl = response.url || url;
    const blocked =
      responseUrl.includes("/blocked_xhunt") ||
      body.includes("/blocked_xhunt") ||
      (contentType.includes("text/html") && body.includes("<html"));

    if (!response.ok) {
      console.error("XHunt rank request failed", {
        username: normalizedUsername,
        status: response.status,
        responseUrl,
        bodySnippet: getBodySnippet(body),
      });

      return {
        rank: null,
        available: false,
        blocked,
        status: blocked ? "blocked" : "unavailable",
        source: "live",
        note: blocked ? "当前服务环境被 XHunt 限制" : `XHunt returned ${response.status}`,
      };
    }

    if (blocked) {
      console.error("XHunt rank request blocked", {
        username: normalizedUsername,
        responseUrl,
        bodySnippet: getBodySnippet(body),
      });

      return {
        rank: null,
        available: false,
        blocked: true,
        status: "blocked",
        source: "live",
        note: "当前服务环境被 XHunt 限制",
      };
    }

    let payload: unknown;
    try {
      payload = JSON.parse(body);
    } catch {
      console.error("XHunt rank payload was not JSON", {
        username: normalizedUsername,
        responseUrl,
        contentType,
        bodySnippet: getBodySnippet(body),
      });

      return {
        rank: null,
        available: false,
        blocked: false,
        status: "unavailable",
        source: "live",
        note: "XHunt 返回了非 JSON 数据",
      };
    }

    const rank = parseXHuntRankPayload(payload, normalizedUsername);
    return {
      rank,
      available: true,
      blocked: false,
      status: rank === null ? "unranked" : "ok",
      source: "live",
      note: rank === null ? "XHunt 暂无该账号排名" : null,
    };
  } catch (error: unknown) {
    console.error("XHunt rank request failed", {
      username: normalizedUsername,
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      rank: null,
      available: false,
      blocked: false,
      status: "unavailable",
      source: "live",
      note: "XHunt 请求失败",
    };
  }
}

export function evaluateCrossValidation(input: {
  rank: number | null;
  available: boolean;
  powerScore: number;
  tier: string;
}): CrossValidationVerdict {
  const tier = input.tier.toUpperCase();
  const rank = input.rank;
  const hasTop200Rank = rank !== null && rank <= 200;
  const hasTop1000Rank = rank !== null && rank <= 1000;
  const isBeyond1000 = rank === null || rank > 1000;
  const isBeyond2000 = rank === null || rank > 2000;

  if (!input.available) {
    return {
      status: "unavailable",
      label: "XHunt 暂不可用",
      subLabel: null,
      summary: "当前环境暂时无法获取 XHunt 排名，交叉验证未完成。",
      operatorHint: "Power Score 仍按最近内容和互动数据正常计算，可先参考当前状态。",
    };
  }

  if (hasTop1000Rank && (tier === "S" || tier === "A")) {
    return {
      status: "certified",
      label: "实力认证",
      subLabel: null,
      summary: "历史地位和当前状态同时在线，属于长期稳定输出的实力派。",
      operatorHint: "优先分配原创、深度 thread 和重点 campaign。",
    };
  }

  if (hasTop200Rank && (tier === "B" || tier === "C" || tier === "D")) {
    return {
      status: "legacy_slipping",
      label: "待激活",
      subLabel: "大将低迷",
      summary: "XHunt 排名很高，但当前 Power Score 回落，说明老牌影响力还在，近期状态偏弱。",
      operatorHint: "先给轻量任务观察 1-2 个周期，再决定是否恢复重点合作。",
    };
  }

  if (rank !== null && rank > 200 && rank <= 1000 && (tier === "C" || tier === "D")) {
    return {
      status: "legacy_slipping",
      label: "待激活",
      subLabel: "一般性掉队",
      summary: "历史积累还在，但近期内容活跃度和互动表现已经明显落后。",
      operatorHint: "暂缓高要求单子，先观察履约速度和内容恢复情况。",
    };
  }

  if (tier === "S" && isBeyond2000) {
    return {
      status: "rising_star",
      label: "潜力新星",
      subLabel: "强势新人",
      summary: "当前数据很强，但 XHunt 排名尚未跟上，可能是强势新人或刚切入 Web3 的新星。",
      operatorHint: "建议优先人工验真后纳入重点观察名单，尽早建立合作。",
    };
  }

  if ((tier === "A" || tier === "B") && isBeyond1000) {
    return {
      status: "rising_star",
      label: "潜力新星",
      subLabel: "稳步上升型",
      summary: "当前表现不错，但历史排名积累还不足，属于稳步上升中的潜力号。",
      operatorHint: "适合提前建联和低成本锁定，观察后续 1-2 个周期的持续性。",
    };
  }

  return {
    status: "normal",
    label: "常规表现",
    subLabel: null,
    summary: "历史地位和当前状态都比较常规，适合标准化使用。",
    operatorHint: "适合铺量型任务或常规合作，不需要额外分层处理。",
  };
}

export function enrichLookupWithXHunt<T extends LookupResponse>(
  result: T,
  xhunt: XHuntLookupSummary
): T & { xhunt: XHuntLookupSummary; crossValidation: CrossValidationVerdict | null } {
  if (!result.kol) {
    return {
      ...result,
      xhunt,
      crossValidation: null,
    };
  }

  return {
    ...result,
    xhunt,
    crossValidation: evaluateCrossValidation({
      rank: xhunt.rank,
      available: xhunt.available,
      powerScore: result.kol.powerScore,
      tier: result.kol.tier,
    }),
  };
}
