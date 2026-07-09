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
import { GuildScheduledEventEntityType, GuildScheduledEventPrivacyLevel } from 'discord.js';
import ScheduledEvent from './ScheduledEvent';
import { Event } from '../Models/Event';

describe('ScheduledEvent.buildCreateOptions', () => {
  const makeEvent = () => {
    const event = new Event();
    event.title = 'Raid night';
    event.description = 'Bring flasks';
    event.eventDate = new Date('2030-01-01T20:00:00Z');
    return event;
  };

  it('mirrors title and start time, with a one-hour end block', () => {
    const event = makeEvent();
    const options = ScheduledEvent.buildCreateOptions(event, 'events', '');

    assert.equal(options.name, 'Raid night');
    assert.equal(options.scheduledStartTime, event.eventDate);
    assert.equal(
      (options.scheduledEndTime as Date).getTime() - event.eventDate.getTime(),
      60 * 60 * 1000);
  });

  it('creates an external, guild-only event located at the channel', () => {
    const options = ScheduledEvent.buildCreateOptions(makeEvent(), 'events', '');

    assert.equal(options.entityType, GuildScheduledEventEntityType.External);
    assert.equal(options.privacyLevel, GuildScheduledEventPrivacyLevel.GuildOnly);
    assert.equal(options.entityMetadata.location, '#events');
  });

  it('appends the signup hint below the description', () => {
    const options = ScheduledEvent.buildCreateOptions(makeEvent(), 'events', 'Sign up in #events.');

    assert.equal(options.description, 'Bring flasks\n\nSign up in #events.');
  });

  it('uses the hint alone when the event has no description', () => {
    const event = makeEvent();
    event.description = undefined;

    const options = ScheduledEvent.buildCreateOptions(event, 'events', 'Sign up in #events.');

    assert.equal(options.description, 'Sign up in #events.');
  });

  it('truncates name, description and location to the API limits', () => {
    const event = makeEvent();
    event.title = 'x'.repeat(150);
    event.description = 'y'.repeat(1100);

    const options = ScheduledEvent.buildCreateOptions(event, 'z'.repeat(150), '');

    assert.equal(options.name.length, 100);
    assert.equal(options.description.length, 1000);
    assert.equal(options.entityMetadata.location.length, 100);
    assert.ok(options.entityMetadata.location.startsWith('#z'));
  });
});
