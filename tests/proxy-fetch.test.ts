import assert from "node:assert/strict";
import test from "node:test";

import { fetchWithServiceProxy } from "../src/lib/proxy-fetch";

test("fetchWithServiceProxy does not rotate AI proxies for model_not_found payload", async () => {
  const previousProxyUrls = process.env.AI_PROXY_URLS;
  process.env.AI_PROXY_URLS =
    "http://user:pass@127.0.0.1:10001,http://user:pass@127.0.0.1:10002";

  let fetchCalls = 0;
  try {
    const response = await fetchWithServiceProxy(
      "ai",
      "https://example.com/v1/messages",
      {},
      {
        fetchImpl: async () => {
          fetchCalls++;
          return new Response(
            JSON.stringify({
              error: {
                code: "model_not_found",
                message: "No available channel for model",
              },
            }),
            {
              status: 503,
              headers: { "Content-Type": "application/json" },
            }
          );
        },
      }
    );

    assert.equal(response.status, 503);
    assert.equal(fetchCalls, 1);
  } finally {
    if (previousProxyUrls === undefined) {
      delete process.env.AI_PROXY_URLS;
    } else {
      process.env.AI_PROXY_URLS = previousProxyUrls;
    }
  }
});

test("fetchWithServiceProxy rotates AI proxies for generic retryable 503 payload", async () => {
  const previousProxyUrls = process.env.AI_PROXY_URLS;
  process.env.AI_PROXY_URLS =
    "http://user:pass@127.0.0.1:10011,http://user:pass@127.0.0.1:10012";

  let fetchCalls = 0;
  try {
    const response = await fetchWithServiceProxy(
      "ai",
      "https://example.com/v1/messages",
      {},
      {
        fetchImpl: async () => {
          fetchCalls++;
          return new Response(
            JSON.stringify({
              error: {
                code: "service_unavailable",
                message: "Service temporarily unavailable",
              },
            }),
            {
              status: 503,
              headers: { "Content-Type": "application/json" },
            }
          );
        },
      }
    );

    assert.equal(response.status, 503);
    assert.equal(fetchCalls, 2);
  } finally {
    if (previousProxyUrls === undefined) {
      delete process.env.AI_PROXY_URLS;
    } else {
      process.env.AI_PROXY_URLS = previousProxyUrls;
    }
  }
});
