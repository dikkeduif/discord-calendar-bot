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

import { strict as assert } from 'assert';
import Auth from './Auth';

const TOKEN = 'a'.repeat(40);

describe('Auth token verification', () => {
  it('accepts exactly the configured token', () => {
    const auth = new Auth(TOKEN);
    assert.equal(auth.verifyToken(TOKEN), true);
  });

  it('rejects wrong tokens without throwing, regardless of length', () => {
    const auth = new Auth(TOKEN);
    assert.equal(auth.verifyToken('b'.repeat(40)), false);
    assert.equal(auth.verifyToken('short'), false);
    assert.equal(auth.verifyToken(''), false);
    assert.equal(auth.verifyToken(undefined), false);
  });

  it('issues a cookie value that verifies and is not the token itself', () => {
    const auth = new Auth(TOKEN);
    const cookie = auth.cookieValue();

    assert.equal(auth.verifyCookie(cookie), true);
    assert.notEqual(cookie, TOKEN);
    assert.ok(!cookie.includes(TOKEN));
  });

  it('invalidates cookies when the token rotates', () => {
    const oldCookie = new Auth(TOKEN).cookieValue();
    const rotated = new Auth('c'.repeat(40));

    assert.equal(rotated.verifyCookie(oldCookie), false);
  });

  it('enforces the minimum token length at construction', () => {
    assert.throws(() => new Auth('tooshort'));
    assert.throws(() => new Auth(''));
  });
});

describe('Auth login limiter', () => {
  it('allows attempts under the limit and blocks past it', () => {
    const auth = new Auth(TOKEN, { maxAttempts: 3, windowMs: 60_000 });

    assert.equal(auth.registerAttempt('1.2.3.4', 0), true);
    assert.equal(auth.registerAttempt('1.2.3.4', 1000), true);
    assert.equal(auth.registerAttempt('1.2.3.4', 2000), true);
    assert.equal(auth.registerAttempt('1.2.3.4', 3000), false);
  });

  it('tracks IPs independently and resets after the window', () => {
    const auth = new Auth(TOKEN, { maxAttempts: 2, windowMs: 60_000 });

    auth.registerAttempt('1.1.1.1', 0);
    auth.registerAttempt('1.1.1.1', 1);
    assert.equal(auth.registerAttempt('1.1.1.1', 2), false);
    assert.equal(auth.registerAttempt('2.2.2.2', 3), true);
    assert.equal(auth.registerAttempt('1.1.1.1', 61_000), true);
  });
});
