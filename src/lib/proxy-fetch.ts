import { ProxyAgent } from "undici";

type ProxyService = "ai" | "xclaw" | "twitter241";

type FetchLike = typeof fetch;

type FetchOptions = {
  fetchImpl?: FetchLike;
  retryableStatuses?: number[];
  logger?: Pick<Console, "warn">;
};

const proxyAgentCache = new Map<string, ProxyAgent>();
const proxyCursorByService = new Map<ProxyService, number>();

const DEFAULT_RETRYABLE_STATUSES = [429, 500, 502, 503, 504];

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

  const pool = rotatePoolByService(service, getProxyPool(service));
  if (pool.length === 0) {
    return fetchImpl(input, init);
  }

  let lastResponse: Response | null = null;
  let lastError: unknown = null;

  for (let index = 0; index < pool.length; index++) {
    const proxyUrl = pool[index];
    const isLastProxy = index === pool.length - 1;

    try {
      const response = await fetchImpl(input, buildRequestInitWithProxy(init, proxyUrl));

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
        proxyUrl,
        status: response.status,
      });
    } catch (error) {
      lastError = error;
      logger.warn("Outbound request retrying with next proxy due network error", {
        service,
        proxyUrl,
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
