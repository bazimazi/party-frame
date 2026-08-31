/**
 * Per-client rate limiting.
 *
 * A phone in a pocket, a stuck touch event or a hostile script can all produce
 * hundreds of messages a second. A token bucket absorbs the bursts that normal
 * play produces (a player mashing submit) while flattening sustained floods.
 *
 * The bucket is deliberately in-memory and per-room: it dies with the session,
 * which is the same lifetime as the connections it governs.
 */

export interface BucketOptions {
  /** Maximum tokens held at once, i.e. the burst size. */
  capacity: number;
  /** Tokens restored per second. */
  refillPerSecond: number;
}

interface Bucket {
  tokens: number;
  lastRefillAt: number;
}

export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(private readonly options: BucketOptions) {}

  /**
   * Consumes one token for `key`.
   *
   * Returns false when the caller is over budget, in which case the message
   * should be dropped and the sender told, never silently ignored - a silently
   * dropped submission looks like a bug to the player.
   */
  tryConsume(key: string, now: number): boolean {
    const bucket = this.buckets.get(key);
    if (!bucket) {
      this.buckets.set(key, { tokens: this.options.capacity - 1, lastRefillAt: now });
      return true;
    }

    const elapsedSeconds = Math.max(0, now - bucket.lastRefillAt) / 1000;
    bucket.tokens = Math.min(
      this.options.capacity,
      bucket.tokens + elapsedSeconds * this.options.refillPerSecond,
    );
    bucket.lastRefillAt = now;

    if (bucket.tokens < 1) return false;
    bucket.tokens -= 1;
    return true;
  }

  /** Drops a client's bucket when it disconnects for good. */
  forget(key: string): void {
    this.buckets.delete(key);
  }

  clear(): void {
    this.buckets.clear();
  }
}

/**
 * Budgets chosen from real play, not from theory:
 *
 * - Game actions: a fast typist submitting and retrying a rejected answer peaks
 *   around three per second, so eight burst / four per second leaves headroom
 *   without letting a script hammer the rules engine.
 * - Session actions (ready, settings, start) are deliberate button presses and
 *   need far less.
 */
export const GAME_ACTION_LIMITS: BucketOptions = { capacity: 8, refillPerSecond: 4 };
export const SESSION_ACTION_LIMITS: BucketOptions = { capacity: 6, refillPerSecond: 2 };
export const CLOCK_PING_LIMITS: BucketOptions = { capacity: 10, refillPerSecond: 2 };
