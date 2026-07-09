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
import InteractionRouter from './InteractionRouter';

describe('InteractionRouter.matchNamespace', () => {
  it('matches the first two segments of namespaced customIds', () => {
    assert.equal(InteractionRouter.matchNamespace('ev:reg:abc123:2'), 'ev:reg');
    assert.equal(InteractionRouter.matchNamespace('ev:del:abc123'), 'ev:del');
    assert.equal(InteractionRouter.matchNamespace('ev:retry'), 'ev:retry');
  });

  it('rejects foreign or malformed customIds', () => {
    assert.equal(InteractionRouter.matchNamespace('foo:bar'), '');
    assert.equal(InteractionRouter.matchNamespace('ev'), '');
    assert.equal(InteractionRouter.matchNamespace(''), '');
  });

  it('is not confused by payload segments containing colons', () => {
    assert.equal(InteractionRouter.matchNamespace('ev:reg:abc:<a:party:12345>'), 'ev:reg');
  });
});
