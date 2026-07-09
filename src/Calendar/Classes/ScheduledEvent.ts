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

import * as Discord from 'discord.js';
import { Event } from '../Models/Event';
import Logger from '../../Bot/Logger';
import { Dictionary, CalendarTranslations } from '../../Dictionaries';

// Discord API limits for guild scheduled events
const MAX_NAME_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 1000;
const MAX_LOCATION_LENGTH = 100;

// External scheduled events require an end time; bot events only have a
// start, so mirror them as one-hour blocks
const DEFAULT_DURATION_MS = 60 * 60 * 1000;

/**
 * Mirrors a bot event as a native Discord scheduled event so it shows up
 * in the server's Events tab with Discord's own start notification.
 * Registration stays on the embed reactions; everything here is best
 * effort, since guilds that never granted Manage Events must keep
 * working exactly as before.
 */
export default class ScheduledEvent {
  public static buildCreateOptions(event: Event, channelName: string, signupHint: string): Discord.GuildScheduledEventCreateOptions {
    let description = event.description ? event.description : '';
    if (signupHint.length > 0) {
      description += (description.length > 0 ? '\n\n' : '') + signupHint;
    }

    return {
      name: event.title.slice(0, MAX_NAME_LENGTH),
      description: description.slice(0, MAX_DESCRIPTION_LENGTH),
      scheduledStartTime: event.eventDate,
      scheduledEndTime: new Date(event.eventDate.getTime() + DEFAULT_DURATION_MS),
      privacyLevel: Discord.GuildScheduledEventPrivacyLevel.GuildOnly,
      entityType: Discord.GuildScheduledEventEntityType.External,
      entityMetadata: { location: ('#' + channelName).slice(0, MAX_LOCATION_LENGTH) },
    };
  }

  private dictionary: Dictionary;

  constructor() {
    this.dictionary = new Dictionary(CalendarTranslations);
  }

  public async create(event: Event, channel: Discord.TextChannel) {
    try {
      const hint = this.dictionary.get('/calendar/scheduledEvent/signupHint').replace('{channel}', channel.name);
      const created = await channel.guild.scheduledEvents.create(ScheduledEvent.buildCreateOptions(event, channel.name, hint));
      event.scheduledEventId = created.id;
    } catch (exc) {
      Logger.error('Unable to create a native scheduled event', { shortId: event.shortId, exception: exc });
    }
  }

  public async update(event: Event, channel: Discord.TextChannel) {
    if (!event.scheduledEventId) {
      return;
    }

    try {
      const hint = this.dictionary.get('/calendar/scheduledEvent/signupHint').replace('{channel}', channel.name);
      const options = ScheduledEvent.buildCreateOptions(event, channel.name, hint);
      await channel.guild.scheduledEvents.edit(event.scheduledEventId, {
        name: options.name,
        description: options.description,
        scheduledStartTime: options.scheduledStartTime,
        scheduledEndTime: options.scheduledEndTime,
      });
    } catch (exc) {
      Logger.error('Unable to update the native scheduled event', { shortId: event.shortId, exception: exc });
    }
  }

  public async delete(event: Event, channel: Discord.TextChannel) {
    if (!event.scheduledEventId) {
      return;
    }

    try {
      await channel.guild.scheduledEvents.delete(event.scheduledEventId);
    } catch (exc) {
      Logger.error('Unable to delete the native scheduled event', { shortId: event.shortId, exception: exc });
    }
  }
}
