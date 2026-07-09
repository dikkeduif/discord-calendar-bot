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
import RegistrationRenderer from '../Classes/RegistrationRenderer';

export default class ReactionHandler {
  private client: Discord.Client
  protected dictionary: Dictionary;

  public constructor(client: Discord.Client) {
    this.client = client;
    this.dictionary = new Dictionary(CalendarTranslations);
  }

  public async processMessage(reaction: Discord.MessageReaction | Discord.PartialMessageReaction, user: Discord.User | Discord.PartialUser): Promise<number> {

    const event: Event = await EventModel.getByMessageId(reaction.message.id);

    if (event === null) {
      // Only guild messages with an embed can be events; reactions on
      // bot DMs or plain-text bot messages are not ours to resurrect.
      // Messages with components are button-era events — they were never
      // reaction-registered, so there is nothing to resurrect from
      if (reaction.message.author.id === this.client.user.id
        && reaction.message.guild !== null
        && reaction.message.embeds.length > 0
        && reaction.message.components.length === 0) {
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

    // Button-era events register via components; a manual reaction on one
    // must not trigger removal attempts, author DMs, or a legacy rebuild
    if (event.registrationSurface === 'buttons') {
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
      const channel = await this.client.channels.fetch(event.channelId) as Discord.TextChannel;
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

    const fields = await RegistrationRenderer.renderFields(this.client, reaction.message.guild, event);

    // Received embeds are read-only data in v14. Rebuild with setFields:
    // from() copies the existing fields, so addFields would duplicate the
    // columns on every reaction until the 25-field limit throws
    const embed = Discord.EmbedBuilder.from(reaction.message.embeds[0]).setFields(fields);

    await reaction.message.edit({ embeds: [embed] });

    return 1;
  }
}