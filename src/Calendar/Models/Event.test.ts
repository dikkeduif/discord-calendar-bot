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
import { Event } from './Event';

describe('Event default options', () => {
  it('builds the default set with the standard decline appended last', () => {
    const event = new Event();
    event.setDefaultOptions();
    event.setDefaultDecline();

    assert.deepEqual(Array.from(event.options.entries()), [
      ['✅', 'Yes'],
      ['❔', 'Maybe'],
      ['❎', 'N/A'],
    ]);
    assert.equal(event.declineOption, '❎');
  });

  it('accepts a custom decline label', () => {
    const event = new Event();
    event.setDefaultOptions();
    event.setDefaultDecline('No');

    assert.equal(event.options.get('❎'), 'No');
    assert.equal(event.declineOption, '❎');
  });

  it('appends the standard decline to a custom option set', () => {
    const event = new Event();
    event.setOption('🍕', 'Pizza');
    event.setOption('🍔', 'Burger');
    event.setDefaultDecline('Can\'t make it');

    assert.deepEqual(Array.from(event.options.keys()), ['🍕', '🍔', '❎']);
    assert.equal(event.declineOption, '❎');
  });
});
