/**
 * A calendar discord bot
 * Copyright (C) 2021 Donald Dewulf
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import * as crypto from 'crypto';

// Below this, the login form is easier to brute force than to type
const MIN_TOKEN_LENGTH = 32;

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_WINDOW_MS = 15 * 60 * 1000;

interface LimiterOptions {
  maxAttempts?: number;
  windowMs?: number;
}

/**
 * Token auth for the dashboard. The cookie carries a value derived from
 * the token (never the token itself), so sessions are stateless across
 * restarts and rotating ADMIN_TOKEN logs every browser out. All
 * comparisons hash first: timingSafeEqual throws on unequal lengths,
 * and hashing removes the length oracle entirely.
 */
export default class Auth {
  private tokenDigest: Buffer;
  private cookieDigest: Buffer;
  private maxAttempts: number;
  private windowMs: number;
  private attempts: Map<string, { count: number, windowStart: number }>;

  constructor(token: string, limiter: LimiterOptions = {}) {
    if (!token || token.length < MIN_TOKEN_LENGTH) {
      throw new Error('ADMIN_TOKEN must be at least ' + MIN_TOKEN_LENGTH + ' characters');
    }

    this.tokenDigest = Auth.digest(token);
    // Second-order digest with a domain separator: the cookie value
    // proves knowledge of the token without containing it
    this.cookieDigest = Auth.digest('cookie:' + token);
    this.maxAttempts = limiter.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.windowMs = limiter.windowMs ?? DEFAULT_WINDOW_MS;
    this.attempts = new Map();
  }

  public verifyToken(provided: string | undefined): boolean {
    return crypto.timingSafeEqual(Auth.digest(provided ?? ''), this.tokenDigest);
  }

  public cookieValue(): string {
    return this.cookieDigest.toString('hex');
  }

  public verifyCookie(provided: string | undefined): boolean {
    return crypto.timingSafeEqual(Auth.digest(provided ?? ''), Auth.digest(this.cookieValue()));
  }

  /**
   * Fixed-window per-IP throttle for the login route. Returns whether
   * this attempt may proceed. Deliberately never a global lockout: an
   * internet scanner must not be able to lock the owner out.
   */
  public registerAttempt(ip: string, now: number = Date.now()): boolean {
    // A public port collects one entry per scanning source address;
    // sweep expired windows so the map cannot grow for the process life
    if (this.attempts.size > 10_000) {
      for (const [key, value] of this.attempts) {
        if (now - value.windowStart >= this.windowMs) {
          this.attempts.delete(key);
        }
      }
    }

    const entry = this.attempts.get(ip);

    if (entry === undefined || now - entry.windowStart >= this.windowMs) {
      this.attempts.set(ip, { count: 1, windowStart: now });
      return true;
    }

    entry.count++;
    return entry.count <= this.maxAttempts;
  }

  private static digest(value: string): Buffer {
    return crypto.createHash('sha256').update(value).digest();
  }
}
