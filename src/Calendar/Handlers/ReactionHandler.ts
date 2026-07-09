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
      // Only guild messages with an embed can be events; reactions on
      // bot DMs or plain-text bot messages are not ours to resurrect
      if (reaction.message.author.id === this.client.user.id
        && reaction.message.guild !== null
        && reaction.message.embeds.length > 0) {
        Logger.error('An event had to recreated in the DB');
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

        for (const [, value] of reactions.cache) {
          const reactionUsers = await value.users.fetch();
          const emoji = value.emoji;

          const emojiName = EmojiValidation.isValidEmoji(emoji.name, this.client);
          if (emojiName !== false) {
            newEvent.setOption(emojiName, ' ');

            for (const [, rUser] of reactionUsers) {
              if (!rUser.bot) {
                if (newEvent.registrations === undefined) {
                  newEvent.registrations = new Map<string, string>();
                }

                newEvent.registrations.set(rUser.id, emojiName)
              }
            }
          }
        }

        await EventModel.create(newEvent);
      }
      return 0;
    }

    // Get the names of the registration groups
    const options = event.options;

    if (!options || options.size === 0) {
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

    // Atomic keyed update so two simultaneous reactions cannot overwrite
    // each other; re-use the returned document so the embed rebuild also
    // reflects registrations written by concurrent reactions
    const updated = await EventModel.findByIdAndUpdate(
      event._id,
      { $set: { ['registrations.' + user.id.toString()]: emojiName } },
      { new: true });

    if (updated && updated.registrations) {
      event.registrations = updated.registrations;
    } else {
      event.registrations.set(user.id.toString(), emojiName);
    }

    const columns = [];
    const registrations = [];

    // Prepare the columns output
    for (const [key, value] of event.options) {
      columns[key] = value + ' (' + key + ') ' + '\n';
      registrations[key] = [];
    }

    // Key is the userid, value is the option they picked
    for (const [key, value] of event.registrations) {
      let registeredUser = this.client.users.cache.get(key);

      try {
        if (registeredUser === undefined) {
          registeredUser = await this.client.users.fetch(key);
        }

        if (registeredUser.partial) {
          await registeredUser.fetch();
        }
      } catch (exception) {
        // A deleted account must not block the embed rebuild for everyone else
        Logger.error('Skipping unresolvable registered user ' + key + ': ' + exception.message);
        continue;
      }

      let guildMember = null;
      if (reaction.message.guild !== null) {
        guildMember = reaction.message.guild.member(registeredUser);
        if (guildMember === null) {
          try {
            guildMember = await reaction.message.guild.members.fetch(registeredUser);
          } catch (exception) {
            guildMember = null;
            Logger.error(exception);
          }
        }
      }

      let nickname: string;
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