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
import { Event, EventModel } from '../Models/Event';
import Settings from '../../settings';
import EmojiValidation from '../Validation/EmojiValidation';
import Logger from '../../Bot/Logger';
import { Dictionary, CalendarTranslations } from '../../Dictionaries';

export default class ReactionHandler {
  private client: Discord.Client
  protected dictionary: Dictionary;

  public constructor(client: Discord.Client) {
    this.client = client;
    this.dictionary = new Dictionary(CalendarTranslations);
  }

  public async processMessage(reaction: Discord.MessageReaction, user: Discord.User | Discord.PartialUser): Promise<number> {

    const event: Event = await EventModel.getByMessageId(reaction.message.id);

    if (event === null) {
      if (reaction.message.author.id === this.client.user.id) {
        Logger.alert('An event had to recreated in the DB');
        const message = reaction.message;
        const myEmbed = reaction.message.embeds[0];
        const reactions = message.reactions;

        const newEvent: Event = new Event();
        newEvent.status = 0;
        newEvent.channelId = message.channel.id;
        newEvent.authorId = message.author.id;
        newEvent.guildId = message.guild.id;
        newEvent.authorName = '';
        newEvent.active = true;
        newEvent.userTimeZone = Settings.get('/defaultTimeZone');
        newEvent.eventTimeZone = Settings.get('/defaultTimeZone');
        newEvent.title = myEmbed.title;
        newEvent.description = myEmbed.description;
        newEvent.messageId = reaction.message.id;

        let counter = 1;
        for (const [index, value] of reactions.cache) {
          const reactionUsers = await value.users.fetch();
          const emoji = value.emoji;

          const emojiName = await EmojiValidation.isValidEmoji(emoji.name, this.client);
          newEvent.setOption(emojiName, ' ');

          for (const [index2, rUser] of reactionUsers) {
            if (!rUser.bot && emojiName !== false) {
              if (newEvent.registrations === undefined) {
                newEvent.registrations = new Map<string, string>();
              }

              newEvent.registrations.set(rUser.id, emojiName)
            }
          }
          counter++;
        }

        await EventModel.create(newEvent);
      }
      return 0;
    }

    // Get the names of the registration groups
    const options = event.options;

    if (options.size === 0) {
      return 0;
    }

    // Remove the user from the reactions
    try {
      await reaction.users.remove(user.id);
    } catch (exception) {
      const author = await this.client.users.fetch(event.authorId);
      // @ts-ignore
      const channel: Discord.TextChannel = await this.client.channels.fetch(event.channelId);
      let msg = this.dictionary.get('/calendar/creation/reactionPermissions');
      msg = msg.replace('{event}', event.title).replace('{channel}', channel.name);
      await author.send(msg);
      Logger.error(exception);
    }

    // Get the name of the option chosen
    let emojiName = reaction.emoji.name;

    if (reaction.emoji.id !== null) {
      emojiName = reaction.emoji.toString();
    }

    if (!event.registrations) {
      event.registrations = new Map<string, string>();
    }

    if (!event.options.get(emojiName)) {
      return 0;
    }

    if (!event.active) {
      return 0;
    }

    event.registrations.set(user.id.toString(), emojiName);
    await EventModel.findByIdAndUpdate({ _id: event._id }, event);

    const columns = [];
    const registrations = [];

    // Prepare the columns output
    for (const [key, value] of event.options) {
      columns[key] = value + ' (' + key + ') ' + '\n';
      registrations[key] = [];
    }

    // Key is the userid, value is the option they picked
    for (const [key, value] of event.registrations) {
      let registeredUser = await this.client.users.cache.get(key);

      if (registeredUser === undefined) {
        registeredUser = await this.client.users.fetch(key);
      }

      if (registeredUser.partial) {
        await registeredUser.fetch();
      }

      if (reaction.message.guild === null) {
        await reaction.message.guild.fetch();
      }

      let guildMember = await reaction.message.guild.member(registeredUser);
      if (guildMember === null) {
        try {
          guildMember = await reaction.message.guild.members.fetch(registeredUser);
        } catch (exception) {
          guildMember = null;
          Logger.error(exception);
        }
      }

      let nickname = '';
      if (guildMember === null || guildMember.nickname === null) {
        nickname = registeredUser.username;
      } else {
        if (guildMember.nickname.length > 0) {
          nickname = guildMember.nickname;
        } else {
          nickname = registeredUser.username;
        }
      }

      registrations[value].push(nickname);
    }

    const embed = reaction.message.embeds[0];
    embed.fields = [];
    for (const key of Object.keys(columns)) {
      const value = columns[key];
      if (registrations[key].length !== 0) {
        embed.addField(value, '>>> ' + registrations[key].join('\n'), true);
      } else {
        embed.addField(value, '-', true);
      }
    }

    await reaction.message.edit(embed);

    return 1;
  }
}