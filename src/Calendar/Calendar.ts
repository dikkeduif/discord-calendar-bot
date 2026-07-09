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

import { CalendarCommands} from './Handlers/CalendarCommands';
import { CalendarReminders} from './Handlers/CalendarReminders';
import InteractionRouter from './Interactions/InteractionRouter';
import { ChannelStateModel } from './Models/ChannelState';
import ChannelStateCache from './Services/ChannelStateCache';
import * as Discord from 'discord.js';
import Logger from '../Bot/Logger';

export class Calendar {

  private handler: CalendarCommands;
  private reminders: CalendarReminders;
  private interactions: InteractionRouter;

  constructor(client: Discord.Client) {
    this.handler = new CalendarCommands(client);
    this.reminders = new CalendarReminders(client);
    this.interactions = new InteractionRouter(client);
  }

  public async registerCommands() {
    return this.interactions.registerCommands();
  }

  public async loadChannelStates() {
    const states = await ChannelStateModel.getAll();
    ChannelStateCache.load(states);
    Logger.info('Loaded ' + states.length + ' channel state record(s)');
  }

  public async handleInteraction(interaction: Discord.Interaction) {
    return this.interactions.route(interaction);
  }

  public async reactionAdded(reaction: Discord.MessageReaction | Discord.PartialMessageReaction, user: Discord.User | Discord.PartialUser) {
    return this.handler.reactionAdded(reaction, user);
  }

  public async reactionRemoved(reaction: Discord.MessageReaction | Discord.PartialMessageReaction, user: Discord.User | Discord.PartialUser) {
    return this.handler.reactionRemoved(reaction, user);
  }

  public async processMessage(message: Discord.Message) {
    return this.handler.processMessage(message);
  }

  public async start() {
    Logger.info('Calendar bot has initialized');
    return this.reminders.eventsReminder();
  }
}