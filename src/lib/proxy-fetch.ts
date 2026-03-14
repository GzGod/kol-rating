import { ProxyAgent } from "undici";

type ProxyService = "ai" | "xclaw" | "twitter241";

type FetchLike = typeof fetch;

type FetchOptions = {
  fetchImpl?: FetchLike;
  retryableStatuses?: number[];
  logger?: Pick<Console, "warn" | "info">;
};

const proxyAgentCache = new Map<string, ProxyAgent>();
const proxyCursorByService = new Map<ProxyService, number>();

const DEFAULT_RETRYABLE_STATUSES = [429, 500, 502, 503, 504];

function parseBoolean(raw: string | undefined): boolean | undefined {
  if (!raw) return undefined;
  const normalized = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return undefined;
}

function isProxyDebugEnabled(service: ProxyService): boolean {
  if (service === "ai") {
    return parseBoolean(process.env.AI_PROXY_DEBUG) ?? parseBoolean(process.env.PROXY_DEBUG) ?? false;
  }
  return parseBoolean(process.env.PROXY_DEBUG) ?? false;
}

function sanitizeProxyForLog(proxyUrl: string): string {
  try {
    const parsed = new URL(proxyUrl);
    const hasAuth = parsed.username.length > 0 || parsed.password.length > 0;
    const authSegment = hasAuth ? "***:***@" : "";
    return `${parsed.protocol}//${authSegment}${parsed.host}`;
  } catch {
    return "[invalid-proxy-url]";
  }
}

function sanitizeTargetForLog(input: RequestInfo | URL): string {
  const raw = typeof input === "string" ? input : input.toString();
  try {
    const parsed = new URL(raw);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    return raw;
  }
}

function parseProxyList(raw: string | undefined): string[] {
  if (!raw) return [];

  return [...new Set(
    raw
      .split(/[\n,;]+/)
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
  )];
}

function getServiceProxyEnvKeys(service: ProxyService): string[] {
  if (service === "ai") {
    return ["AI_PROXY_URLS", "AI_PROXY_URL"];
  }
  if (service === "xclaw") {
    return ["XCLAW_PROXY_URLS", "XCLAW_PROXY_URL"];
  }
  return ["TWITTER241_PROXY_URLS", "TWITTER241_PROXY_URL"];
}

function getGlobalProxyEnvKeys(): string[] {
  return ["OUTBOUND_PROXY_URLS", "OUTBOUND_PROXY_URL"];
}

function getProxyPool(service: ProxyService): string[] {
  const servicePool = getServiceProxyEnvKeys(service)
    .flatMap((envKey) => parseProxyList(process.env[envKey]));
  if (servicePool.length > 0) {
    return [...new Set(servicePool)];
  }

  return [...new Set(
    getGlobalProxyEnvKeys().flatMap((envKey) => parseProxyList(process.env[envKey]))
  )];
}

function rotatePoolByService(service: ProxyService, pool: string[]): string[] {
  if (pool.length <= 1) return pool;

  const cursor = proxyCursorByService.get(service) || 0;
  const start = cursor % pool.length;
  proxyCursorByService.set(service, cursor + 1);

  return [...pool.slice(start), ...pool.slice(0, start)];
}

function getProxyAgent(proxyUrl: string): ProxyAgent {
  const cached = proxyAgentCache.get(proxyUrl);
  if (cached) return cached;

  const created = new ProxyAgent(proxyUrl);
  proxyAgentCache.set(proxyUrl, created);
  return created;
}

type RequestInitWithDispatcher = RequestInit & { dispatcher?: unknown };

function buildRequestInitWithProxy(init: RequestInit, proxyUrl: string): RequestInitWithDispatcher {
  return {
    ...init,
    dispatcher: getProxyAgent(proxyUrl),
  };
}

export async function fetchWithServiceProxy(
  service: ProxyService,
  input: RequestInfo | URL,
  init: RequestInit = {},
  options: FetchOptions = {}
): Promise<Response> {
  const fetchImpl = options.fetchImpl || fetch;
  const logger = options.logger || console;
  const retryableStatuses = new Set(options.retryableStatuses || DEFAULT_RETRYABLE_STATUSES);
  const proxyDebugEnabled = isProxyDebugEnabled(service);

  const pool = rotatePoolByService(service, getProxyPool(service));
  if (pool.length === 0) {
    if (proxyDebugEnabled) {
      logger.info("Proxy debug: no proxy configured, using direct outbound request", {
        service,
        target: sanitizeTargetForLog(input),
      });
    }
    return fetchImpl(input, init);
  }

  if (proxyDebugEnabled) {
    logger.info("Proxy debug: resolved proxy pool", {
      service,
      poolSize: pool.length,
      proxies: pool.map(sanitizeProxyForLog),
      target: sanitizeTargetForLog(input),
    });
  }

  let lastResponse: Response | null = null;
  let lastError: unknown = null;

  for (let index = 0; index < pool.length; index++) {
    const proxyUrl = pool[index];
    const proxyForLog = sanitizeProxyForLog(proxyUrl);
    const isLastProxy = index === pool.length - 1;
    if (proxyDebugEnabled) {
      logger.info("Proxy debug: dispatching request via proxy", {
        service,
        attempt: index + 1,
        poolSize: pool.length,
        proxy: proxyForLog,
      });
    }

    try {
      const response = await fetchImpl(input, buildRequestInitWithProxy(init, proxyUrl));

      if (proxyDebugEnabled) {
        logger.info("Proxy debug: received response via proxy", {
          service,
          attempt: index + 1,
          proxy: proxyForLog,
          status: response.status,
        });
      }

      if (!retryableStatuses.has(response.status) || isLastProxy) {
        return response;
      }

      // Avoid keeping sockets/bodies alive when retrying the same request through next proxy.
      try {
        await response.arrayBuffer();
      } catch {
        // Swallow body read errors and continue fallback attempts.
      }

      lastResponse = response;
      logger.warn("Outbound request retrying with next proxy due status", {
        service,
        proxy: proxyForLog,
        status: response.status,
      });
    } catch (error) {
      lastError = error;
      logger.warn("Outbound request retrying with next proxy due network error", {
        service,
        proxy: proxyForLog,
        message: error instanceof Error ? error.message : String(error),
      });

      if (isLastProxy) {
        throw error;
      }
    }
  }

  if (lastResponse) return lastResponse;
  throw lastError instanceof Error ? lastError : new Error(`All proxies failed for ${service}`);
}
