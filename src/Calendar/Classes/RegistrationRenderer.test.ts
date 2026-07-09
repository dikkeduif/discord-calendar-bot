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

// Characterization of the registration-column rendering extracted from
// ReactionHandler: the exact name/value shapes the bot has always produced.

import { strict as assert } from 'assert';
import RegistrationRenderer from './RegistrationRenderer';

describe('RegistrationRenderer.buildFields', () => {
  const options = new Map<string, string>([
    ['✅', 'Yes'],
    ['❔', 'Maybe'],
    ['❎', 'N/A'],
  ]);

  it('renders one inline column per option, in options order, with the legacy name shape', () => {
    const fields = RegistrationRenderer.buildFields(options, new Map());

    assert.equal(fields.length, 3);
    assert.deepEqual(fields.map((f) => f.name), ['Yes (✅) \n', 'Maybe (❔) \n', 'N/A (❎) \n']);
    assert.ok(fields.every((f) => f.inline === true));
  });

  it('renders a dash for empty columns and a quote block of nicknames otherwise', () => {
    const nicknames = new Map<string, string[]>([
      ['✅', ['alice', 'bob']],
    ]);

    const fields = RegistrationRenderer.buildFields(options, nicknames);

    assert.equal(fields[0].value, '>>> alice\nbob');
    assert.equal(fields[1].value, '-');
    assert.equal(fields[2].value, '-');
  });

  it('clamps legacy-interview excess to the embed limits instead of throwing', () => {
    const oversized = new Map<string, string>();
    for (let i = 0; i < 30; i++) {
      oversized.set('key' + i, i === 0 ? 'x'.repeat(300) : 'Label ' + i);
    }

    const fields = RegistrationRenderer.buildFields(oversized, new Map());

    assert.equal(fields.length, 25);
    assert.equal(fields[0].name.length, 256);
  });

  it('tolerates nickname lists for options that no longer exist', () => {
    const nicknames = new Map<string, string[]>([
      ['👻', ['ghost']],
    ]);

    const fields = RegistrationRenderer.buildFields(options, nicknames);

    assert.equal(fields.length, 3);
    assert.ok(fields.every((f) => f.value === '-'));
  });
});
