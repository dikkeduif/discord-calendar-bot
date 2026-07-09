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
import ModifyCommand from './ModifyCommand';
import { Event } from '../Models/Event';

describe('ModifyCommand.formatChoiceName', () => {
  const makeEvent = (title: string) => {
    const event = new Event();
    event.title = title;
    event.shortId = 'abc123';
    event.eventDate = new Date('2030-01-01T20:00:00Z');
    event.eventTimeZone = 'Europe/London';
    return event;
  };

  it('renders title, local time, and short id', () => {
    const name = ModifyCommand.formatChoiceName(makeEvent('Raid night'));

    assert.equal(name, 'Raid night — 01-01 20:00 (abc123)');
  });

  it('stays within the 100-char autocomplete limit for long titles', () => {
    const name = ModifyCommand.formatChoiceName(makeEvent('x'.repeat(200)));

    assert.ok(name.length <= 100);
    assert.ok(name.endsWith('(abc123)'));
  });
});

describe('ModifyCommand.resolveReminderChange', () => {
  it('treats blank input as unchanged', () => {
    assert.deepEqual(ModifyCommand.resolveReminderChange('', 30), { changed: false });
    assert.deepEqual(ModifyCommand.resolveReminderChange('   ', undefined), { changed: false });
  });

  it('treats zero as disabling the reminder', () => {
    assert.deepEqual(ModifyCommand.resolveReminderChange('0', 30), { changed: true, reminder: null });
  });

  it('accepts positive minutes and detects real changes', () => {
    assert.deepEqual(ModifyCommand.resolveReminderChange('45', 30), { changed: true, reminder: 45 });
    assert.deepEqual(ModifyCommand.resolveReminderChange('30', 30), { changed: false });
  });

  it('rejects non-numeric and negative input', () => {
    assert.equal(ModifyCommand.resolveReminderChange('abc', 30).error, true);
    assert.equal(ModifyCommand.resolveReminderChange('-5', 30).error, true);
    assert.equal(ModifyCommand.resolveReminderChange('1.5', 30).error, true);
  });
});
