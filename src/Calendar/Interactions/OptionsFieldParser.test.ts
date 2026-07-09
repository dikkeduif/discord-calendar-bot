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
import OptionsFieldParser from './OptionsFieldParser';

// EmojiValidation only touches client.emojis.cache.get/.find
const fakeClient: any = {
  emojis: {
    cache: {
      get: (id: string) => id === '123456789' ? { toString: () => '<a:party:123456789>' } : undefined,
      find: () => undefined,
    },
  },
};

const parse = (input: string) => OptionsFieldParser.parse(input, fakeClient, '❎');

describe('OptionsFieldParser', () => {
  it('returns an empty option set for blank input (caller applies defaults)', () => {
    for (const input of ['', '   ', '\n \n']) {
      const result = parse(input);
      assert.equal(result.ok, true);
      assert.equal((result as any).options.size, 0);
    }
  });

  it('parses one emoji + label per line, skipping blank lines', () => {
    const result = parse('🍕 Pizza night\n\n👍 Sounds good');

    assert.equal(result.ok, true);
    assert.deepEqual(Array.from((result as any).options.entries()), [
      ['🍕', 'Pizza night'],
      ['👍', 'Sounds good'],
    ]);
  });

  it('normalizes :shortcode: input to unicode', () => {
    const result = parse(':pizza: Pizza night');

    assert.equal(result.ok, true);
    assert.ok((result as any).options.has('🍕'));
  });

  it('accepts custom emoji the bot can see', () => {
    const result = parse('<a:party:123456789> Party');

    assert.equal(result.ok, true);
    assert.ok((result as any).options.has('<a:party:123456789>'));
  });

  it('rejects unknown emoji with the offending line', () => {
    const result = parse('🍕 Pizza\nnotanemoji Nope');

    assert.equal(result.ok, false);
    assert.equal((result as any).reason, 'invalidEmoji');
    assert.equal((result as any).line, 'notanemoji Nope');
  });

  it('rejects lines without a label', () => {
    const result = parse('🍕');

    assert.equal(result.ok, false);
    assert.equal((result as any).reason, 'missingLabel');
  });

  it('rejects labels over the 80-char button limit', () => {
    const result = parse('🍕 ' + 'x'.repeat(81));

    assert.equal(result.ok, false);
    assert.equal((result as any).reason, 'labelTooLong');
  });

  it('rejects duplicate emoji, including variation-selector twins', () => {
    const plain = parse('🍕 One\n🍕 Two');
    assert.equal(plain.ok, false);
    assert.equal((plain as any).reason, 'duplicate');

    const vs16 = parse('❤ Heart\n❤️ Also heart');
    assert.equal(vs16.ok, false);
    assert.equal((vs16 as any).reason, 'duplicate');
  });

  it('rejects the standard decline emoji as a custom option', () => {
    const result = parse('❎ Not coming');

    assert.equal(result.ok, false);
    assert.equal((result as any).reason, 'declineCollision');
  });

  it('rejects more than 24 options', () => {
    const emoji = ['😀', '😁', '😂', '🤣', '😃', '😄', '😅', '😆', '😉', '😊',
      '😋', '😎', '😍', '😘', '🥰', '😗', '😙', '😚', '🙂', '🤗', '🤩', '🤔', '🤨', '😐', '😑'];
    const input = emoji.map((e, i) => e + ' Option ' + i).join('\n');

    const result = parse(input);

    assert.equal(result.ok, false);
    assert.equal((result as any).reason, 'tooMany');
  });
});
