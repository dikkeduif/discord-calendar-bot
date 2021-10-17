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
import { SessionManager } from '../Classes/SessionManager';
import { Dictionary, CalendarTranslations } from '../../Dictionaries';
import { Event } from '../Models/Event';
import { UserModel, User } from '../Models/User';
import Logger from '../../Bot/Logger';
import EventCreationProgress from '../Enums/EventCreationProgress';
import CreateHandler from './CreateHandler';
import ModifyHandler from './ModifyHandler';
import ReactionHandler from './ReactionHandler';
import AbstractHandler from './AbstractHandler';
import Timeout = NodeJS.Timeout;
import Settings from '../../settings';

export class CalendarCommands {
  private client: Discord.Client;
  private sessionManager: SessionManager;
  private logger: any;
  private dictionary: Dictionary;
  private handlers: AbstractHandler[];
  private reactionHandlers: ReactionHandler[];
  private userTimeOuts: Map<string, Timeout>;

  constructor(client: Discord.Client) {
    this.handlers = [];
    this.handlers.push(new ModifyHandler(client));
    this.handlers.push(new CreateHandler(client));

    this.reactionHandlers = [];
    this.reactionHandlers.push(new ReactionHandler(client));

    this.client = client;
    this.sessionManager = new SessionManager();
    this.userTimeOuts = new Map<string, NodeJS.Timeout>();
    this.logger = Logger;
    this.dictionary = new Dictionary(CalendarTranslations);
  }

  public async processMessage(message: Discord.Message) {
    // Only process if message is not coming from a bot
    if (!message.author.bot) {
      const textParts = message.content.split(' ');

      // First part of the text
      const command = textParts[0];

      if (command === '!help' && !message.author.bot && message.channel.type === 'dm') {
        await this.showHelp(message);
        return true;
      }

      // Try to get an active session for this user
      let event: Event = this.sessionManager.getSession(message.author.id);

      // Return status from one of the handlers
      let status = 0;

      // No session was found
      if (event === undefined) {
        for (const handler of this.handlers) {
          if (handler.canProcessCommand(command, message.channel.type)) {
            let guildId = '';
            if (message.guild) {
              guildId = message.guild.id;
            }
            const user = await UserModel.getUserByUserAndGuildId(message.author.id, guildId);
            event = await this.sessionManager.create(message.author.id, message.author.username, message.channel.id, guildId, handler.getSessionType(), user);

            status = await handler.processMessage(message, event, this.sessionManager);
            this.timeoutSession(message.author.id);
          }
        }
      } else {
        for (const handler of this.handlers) {
          status = await handler.processMessage(message, event, this.sessionManager);
          this.timeoutSession(message.author.id);
        }
      }

      if (status === EventCreationProgress.Exit || status === EventCreationProgress.Done) {
        await this.sessionManager.finishSession(message.author.id);

        if (this.userTimeOuts.has(message.author.id)) {
          clearTimeout(this.userTimeOuts.get(message.author.id));
        }
      }
    }

    return true;
  }

  /**
   * @param authorId
   * @private
   */
  private timeoutSession(authorId: string) {

    if (this.userTimeOuts.has(authorId)) {
      clearTimeout(this.userTimeOuts.get(authorId));
    }

    const timeout = parseInt(Settings.get('/sessionTimeout'), 10) * 1000;
    const id = setTimeout((userId) => {
      if (userId) {
        this.client.users.fetch(userId).then((user) => {
          const msg = this.dictionary.get('/calendar/general/sessionEnd');
          user.send(msg);
        })
        return this.sessionManager.finishSession(userId)
      }
    }, timeout, authorId);

    this.userTimeOuts.set(authorId, id);
  }

  public async reactionAdded(reaction: Discord.MessageReaction, user: Discord.User | Discord.PartialUser) {
    if (reaction.message.partial) {
      try {
        await reaction.message.fetch();
      } catch (e) {
        this.logger.info(e);
      }
    }

    for (const handler of this.reactionHandlers) {
      await handler.processMessage(reaction, user)
    }
  }

  public async reactionRemoved(reaction: Discord.MessageReaction, user: Discord.User | Discord.PartialUser) {
    if (reaction.message.partial) {
      try {
        await reaction.message.fetch();
      } catch (e) {
        this.logger.info(e);
      }
    }

    // Not used
    // return this.updateRegistrations(reaction);
  }

  private async showHelp(message: Discord.Message) {
    await message.author.send(this.dictionary.get('/calendar/general/help'));
  }
}