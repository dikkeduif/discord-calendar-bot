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
import { CalendarReminders } from './CalendarReminders';
import { Event } from '../Models/Event';

describe('CalendarReminders.formatChannelReminder', () => {
  it('renders mentions, title, minutes and date into the template', () => {
    const event = new Event();
    event.title = 'Raid night';
    event.reminder = 30;

    const msg = CalendarReminders.formatChannelReminder(
      event,
      ['<@!111>', '<@!222>'],
      'Friday, July 10th 2026, 20:00 CEST');

    assert.equal(msg, 'Hey <@!111> <@!222>, you registered for the event ``Raid night`` on Friday, July 10th 2026, 20:00 CEST. We\'re about to start in 30 minutes');
  });

  it('renders a single registrant without a stray separator', () => {
    const event = new Event();
    event.title = 'Standup';
    event.reminder = 5;

    const msg = CalendarReminders.formatChannelReminder(event, ['<@!1>'], 'tomorrow');

    assert.ok(msg.startsWith('Hey <@!1>, you registered'));
    assert.ok(!msg.includes('function join'));
  });
});
