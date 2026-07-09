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
import AdminCommand from './AdminCommand';

describe('AdminCommand.isOwner', () => {
  it('matches only the configured owner id', () => {
    assert.equal(AdminCommand.isOwner('123', '123'), true);
    assert.equal(AdminCommand.isOwner('456', '123'), false);
  });

  it('always refuses when no owner is configured', () => {
    assert.equal(AdminCommand.isOwner('123', undefined), false);
    assert.equal(AdminCommand.isOwner('123', ''), false);
    assert.equal(AdminCommand.isOwner(undefined, undefined), false);
  });
});

describe('AdminCommand.chunkLines', () => {
  it('keeps small lists in one message', () => {
    const chunks = AdminCommand.chunkLines(['a', 'b', 'c'], 100);
    assert.deepEqual(chunks, ['a\nb\nc']);
  });

  it('splits when the character budget would overflow', () => {
    const chunks = AdminCommand.chunkLines(['x'.repeat(60), 'y'.repeat(60)], 100);
    assert.equal(chunks.length, 2);
  });

  it('caps the number of rows and reports the overflow', () => {
    const lines = Array.from({ length: 30 }, (_, i) => 'row ' + i);
    const chunks = AdminCommand.chunkLines(lines, 2000, 15);

    assert.equal(chunks.length, 1);
    assert.ok(chunks[0].includes('row 14'));
    assert.ok(!chunks[0].includes('row 15'));
    assert.ok(chunks[0].includes('15 more'));
  });
});

describe('AdminCommand.isSnowflake', () => {
  it('accepts numeric discord ids and rejects everything else', () => {
    assert.equal(AdminCommand.isSnowflake('783431900312109107'), true);
    assert.equal(AdminCommand.isSnowflake('12345'), false);
    assert.equal(AdminCommand.isSnowflake('abc'), false);
    assert.equal(AdminCommand.isSnowflake(''), false);
  });
});
