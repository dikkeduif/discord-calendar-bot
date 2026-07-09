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
import TimezoneCommand from './TimezoneCommand';

describe('TimezoneCommand.filterZones', () => {
  it('matches case-insensitive substrings anywhere in the zone name', () => {
    const zones = TimezoneCommand.filterZones('brussels');

    assert.deepEqual(zones, ['Europe/Brussels']);
  });

  it('caps results at the 25-choice autocomplete limit', () => {
    assert.ok(TimezoneCommand.filterZones('america').length <= 25);
    assert.ok(TimezoneCommand.filterZones('').length <= 25);
  });

  it('returns nothing for garbage', () => {
    assert.deepEqual(TimezoneCommand.filterZones('notazone123'), []);
  });
});
