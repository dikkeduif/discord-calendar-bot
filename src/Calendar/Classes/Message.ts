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

import { Event, EventModel } from '../Models/Event';
import * as Discord from 'discord.js';
import moment_tz from 'moment-timezone';
import Logger from '../../Bot/Logger';

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

    const embed: any = new Discord.MessageEmbed()
      .setColor('#f8d040')
      .setTitle(title)
      .setDescription(description)
      .setTimestamp()
      .setFooter('created by ' + event.authorName + ', your event id is [ ' + event.shortId + ' ]');

    const channel: any = await this.client.channels.fetch(event.channelId);

    try {
      const result: Discord.Message = await channel.send(embed);

      event.messageId = result.id;
      const options = event.options;

      if (options) {
        for (const [key, value] of options) {
          const emojiName: string = key;
          await result.react(emojiName);
        }
      }
    } catch (exc) {
      Logger.error('Unable to post a new event', { event, exception: exc });
    }
  }

  public async updateEventMessage(event: Event) {
    // @ts-ignore
    const channel: Discord.TextChannel = await this.client.channels.fetch(event.channelId);

    const message = await channel.messages.fetch(event.messageId);
    const embed = message.embeds[0];

    if (embed) {
      const newDateServer = moment_tz(event.eventDate).unix();
      let description = event.description;
      // 20201213T230000
      description += '\n\n**Time**\n' + '<t:' + newDateServer + ':F> (<t:' + newDateServer + ':R>)';

      embed
        .setColor('#f8d040')
        .setTitle(event.title)
        .setDescription(description)
        .setTimestamp()
        .setFooter('created by ' + event.authorName + ', your event id is [ ' + event.shortId + ' ]');

      try {
        await message.edit(embed);
      } catch (exc) {
        Logger.alert('Unable to edit an event', { event, exception: exc });
      }
    }
  }

  public async delete(event: Event) {
    // @ts-ignore
    const channel: Discord.TextChannel = await this.client.channels.fetch(event.channelId);

    const message = await channel.messages.fetch(event.messageId)
    try {
      await message.delete();
    } catch (exc) {
      Logger.alert('Unable to delete an event', { event, exception: exc });
    }
  }
}
