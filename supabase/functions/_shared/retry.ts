// Retry helper with exponential backoff + jitter.
// Use for any outbound HTTP call to a customer API. Honors Retry-After
// when the thrown error exposes it. Caller decides what counts as retryable
// via the `isRetryable` predicate (defaults to network errors + 5xx + 429).

export interface RetryOptions {
  maxAttempts?: number;       // default 5
  baseDelayMs?: number;       // default 500
  maxDelayMs?: number;        // default 30_000
  isRetryable?: (err: unknown) => boolean;
  onRetry?: (err: unknown, attempt: number, delayMs: number) => void;
}

export class RetryableHttpError extends Error {
  constructor(
    message: string,
    public status: number,
    public retryAfterMs?: number,
  ) {
    super(message);
    this.name = "RetryableHttpError";
  }
}

const DEFAULT_RETRYABLE = (err: unknown): boolean => {
  if (err instanceof RetryableHttpError) {
    return err.status === 429 || err.status >= 500;
  }
  // Network / fetch errors are typically TypeError in Deno
  return err instanceof TypeError;
};

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 5;
  const baseDelay   = opts.baseDelayMs ?? 500;
  const maxDelay    = opts.maxDelayMs  ?? 30_000;
  const isRetryable = opts.isRetryable ?? DEFAULT_RETRYABLE;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === maxAttempts || !isRetryable(err)) throw err;

      const retryAfter = err instanceof RetryableHttpError ? err.retryAfterMs : undefined;
      const exp        = Math.min(maxDelay, baseDelay * 2 ** (attempt - 1));
      const jitter     = Math.random() * exp * 0.25;
      const delay      = retryAfter ?? Math.min(maxDelay, exp + jitter);

      opts.onRetry?.(err, attempt, delay);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw lastError;
}

// Convenience wrapper around fetch that throws RetryableHttpError on
// 429 / 5xx and parses Retry-After (seconds or HTTP-date).
export async function fetchWithRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
  opts?: RetryOptions,
): Promise<Response> {
  return withRetry(async () => {
    const res = await fetch(input, init);
    if (res.status === 429 || res.status >= 500) {
      const retryAfterHeader = res.headers.get("retry-after");
      let retryAfterMs: number | undefined;
      if (retryAfterHeader) {
        const asInt = parseInt(retryAfterHeader, 10);
        if (!isNaN(asInt)) {
          retryAfterMs = asInt * 1000;
        } else {
          const dateMs = Date.parse(retryAfterHeader);
          if (!isNaN(dateMs)) retryAfterMs = Math.max(0, dateMs - Date.now());
        }
      }
      throw new RetryableHttpError(
        `HTTP ${res.status} ${res.statusText}`,
        res.status,
        retryAfterMs,
      );
    }
    return res;
  }, opts);
}
