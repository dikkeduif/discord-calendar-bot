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

import { Event } from '../Models/Event';
import * as Discord from 'discord.js';
import moment_tz from 'moment-timezone';
import Logger from '../../Bot/Logger';
import ScheduledEvent from './ScheduledEvent';
import RegistrationRenderer from './RegistrationRenderer';
import RegistrationButtonHandler from '../Interactions/RegistrationButtonHandler';
import ChannelStateCache from '../Services/ChannelStateCache';

export default class Message {
  private messageId: string;
  private client: Discord.Client;

  constructor(client, messageId?: string) {
    this.client = client;
    this.messageId = messageId
  }

  public async postNewMessageAndUpdate(event: Event) {
    const newDateServer = moment_tz(event.eventDate).unix();

    const title = event.title;

    let description = event.description;
    // 20201213T230000
    description += '\n\n**Time**\n' + '<t:' + newDateServer + ':F> (<t:' + newDateServer + ':R>)';

    // Hard safety net for every creation surface (slash, legacy
    // interview, retry drafts): detached channels never get a post. The
    // surfaces give their own friendlier rejections earlier; deactivate
    // here so no ghost event survives the race
    if (ChannelStateCache.isBlocked(event.channelId)) {
      event.active = false;
      Logger.info('Blocked event post into detached channel', { channelId: event.channelId, shortId: event.shortId });
      return;
    }

    // Every new event registers via buttons, whichever surface created
    // it; the legacy reaction path only serves messages posted before this
    event.registrationSurface = 'buttons';

    const embed = new Discord.EmbedBuilder()
      .setColor('#f8d040')
      .setTitle(title)
      .setDescription(description)
      .setTimestamp()
      .setFooter({ text: 'created by ' + event.authorName + ', your event id is [ ' + event.shortId + ' ]' });

    try {
      if (event.hasOptions()) {
        // Empty columns render at post time so the embed shape is stable
        // from the first click onwards. Inside the try: EmbedBuilder
        // validates eagerly, and callers rely on post failures being
        // contained here
        embed.setFields(RegistrationRenderer.buildFields(event.options, new Map()));
      }

      const channel = await this.client.channels.fetch(event.channelId) as Discord.TextChannel;
      const result: Discord.Message = await channel.send({
        embeds: [embed],
        components: RegistrationButtonHandler.buildButtonRows(event),
      });

      event.messageId = result.id;

      // Mirror as a native scheduled event (Events tab + Discord's own
      // start notification); the id persists with the session document
      await new ScheduledEvent().create(event, channel);
    } catch (exc) {
      Logger.error('Unable to post a new event', { event, exception: exc });
    }
  }

  public async updateEventMessage(event: Event): Promise<boolean> {
    try {
      const channel = await this.client.channels.fetch(event.channelId) as Discord.TextChannel;

      const message = await channel.messages.fetch(event.messageId);
      const embed = message.embeds[0];
      let edited = false;

      if (embed) {
        const newDateServer = moment_tz(event.eventDate).unix();
        let description = event.description;
        // 20201213T230000
        description += '\n\n**Time**\n' + '<t:' + newDateServer + ':F> (<t:' + newDateServer + ':R>)';

        // Received embeds are read-only data in v14; rebuild to mutate
        const rebuilt = Discord.EmbedBuilder.from(embed)
          .setColor('#f8d040')
          .setTitle(event.title)
          .setDescription(description)
          .setTimestamp()
          .setFooter({ text: 'created by ' + event.authorName + ', your event id is [ ' + event.shortId + ' ]' });

        await message.edit({ embeds: [rebuilt] });
        edited = true;
      }

      // The native mirror follows the DB, not the embed: a suppressed
      // embed must not leave the Events-tab entry stale
      await new ScheduledEvent().update(event, channel);

      return edited;
    } catch (exc) {
      Logger.error('Unable to edit an event', { event, exception: exc });
      return false;
    }
  }

  public async delete(event: Event) {
    let channel: Discord.TextChannel;
    try {
      channel = await this.client.channels.fetch(event.channelId) as Discord.TextChannel;
    } catch (exc) {
      Logger.error('Unable to delete an event', { event, exception: exc });
      // The channel may be gone while the guild is not: the native
      // mirror is guild-scoped and must not outlive the event
      const guild = event.guildId ? this.client.guilds.cache.get(event.guildId) : undefined;
      if (guild !== undefined) {
        await new ScheduledEvent().delete(event, guild);
      }
      return;
    }

    try {
      const message = await channel.messages.fetch(event.messageId)
      await message.delete();
    } catch (exc) {
      // The message may already be gone (deleted by hand); the native
      // scheduled event still needs cleaning up below
      Logger.error('Unable to delete the event message', { event, exception: exc });
    }

    await new ScheduledEvent().delete(event, channel.guild);
  }
}
