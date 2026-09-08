/**
 * LoginGuard — cheap resource controls for the one public unauthenticated route
 * (`POST /api/login`) so it can't be turned into a CPU sink (audit #7).
 *
 * Two independent bounds, both in-process (sufficient for the single-writer
 * deploys SleepBot targets — the JSON store is single-instance and the Postgres
 * path runs one instance):
 *
 *  - a fixed-window per-key attempt limiter (an attacker from one source is
 *    throttled to `maxPerWindow` tries per `windowMs`), and
 *  - a global concurrency cap on in-flight password verifications, so even a
 *    distributed flood can't run more than `maxConcurrent` scrypt hashes at
 *    once regardless of the per-key limit.
 */
export interface LoginGuardOptions {
  windowMs?: number;
  maxPerWindow?: number;
  maxConcurrent?: number;
  /** Injectable clock for tests. */
  now?: () => number;
}

export class LoginGuard {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();
  private inFlight = 0;

  constructor(private readonly opts: LoginGuardOptions = {}) {}

  private get windowMs(): number {
    return this.opts.windowMs ?? 60_000;
  }
  private get maxPerWindow(): number {
    return this.opts.maxPerWindow ?? 10;
  }
  private get maxConcurrent(): number {
    return this.opts.maxConcurrent ?? 4;
  }
  private now(): number {
    return (this.opts.now ?? Date.now)();
  }

  /**
   * Record an attempt from `key` (e.g. the client IP). Returns false once the
   * window budget is exhausted; the window resets `windowMs` after the first
   * attempt in it.
   */
  allow(key: string): boolean {
    const t = this.now();
    // Opportunistically drop stale buckets so the map can't grow without bound
    // under a spray of distinct keys.
    if (this.hits.size > 10_000) this.sweep(t);

    const rec = this.hits.get(key);
    if (!rec || t >= rec.resetAt) {
      this.hits.set(key, { count: 1, resetAt: t + this.windowMs });
      return true;
    }
    if (rec.count >= this.maxPerWindow) return false;
    rec.count++;
    return true;
  }

  /**
   * Reserve a verification slot. Returns false when `maxConcurrent` hashes are
   * already running — the caller should shed load (429) rather than queue
   * unbounded work. On true, the caller MUST call {@link release} in a finally.
   */
  tryAcquire(): boolean {
    if (this.inFlight >= this.maxConcurrent) return false;
    this.inFlight++;
    return true;
  }

  release(): void {
    if (this.inFlight > 0) this.inFlight--;
  }

  private sweep(t: number): void {
    for (const [k, rec] of this.hits) if (t >= rec.resetAt) this.hits.delete(k);
  }
}
