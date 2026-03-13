export function normalizeHandle(handle: string): string {
  return handle.replace(/^@+/, "").trim().toLowerCase();
}

export function isDatabaseConnectionError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const maybeError = error as { code?: unknown; message?: unknown };
  const code = typeof maybeError.code === "string" ? maybeError.code : "";
  const message =
    typeof maybeError.message === "string"
      ? maybeError.message
      : error instanceof Error
        ? error.message
        : "";

  return (
    code === "P1001" ||
    code === "P1002" ||
    message.includes("Can't reach database server") ||
    message.includes("Timed out fetching a new connection") ||
    message.includes("ECONNREFUSED")
  );
}

export async function resolveHandleLookup<T>(
  handle: string,
  deps: {
    loadPersisted: (normalizedHandle: string) => Promise<T>;
    loadTransient: (normalizedHandle: string) => Promise<T>;
  }
): Promise<T> {
  const normalizedHandle = normalizeHandle(handle);

  try {
    return await deps.loadPersisted(normalizedHandle);
  } catch (error) {
    if (isDatabaseConnectionError(error)) {
      return deps.loadTransient(normalizedHandle);
    }
    throw error;
  }
}
