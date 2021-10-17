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
import { Dictionary, CalendarTranslations } from '../../Dictionaries';
import { SessionManager } from '../Classes/SessionManager';

abstract class AbstractHandler {
  readonly command: string;
  readonly sessionType: string;
  private allowedChannelTypes: string[];
  protected dictionary: Dictionary;

  protected constructor(command: string, channelType: string[], sessionType: string) {
    this.command = command;
    this.sessionType = sessionType;
    this.allowedChannelTypes = channelType;
    this.dictionary = new Dictionary(CalendarTranslations);
  }

  public abstract processMessage(message: Discord.Message, event: Event, sessionManager: SessionManager): Promise<number>;

  public canProcessCommand(command: string, channelType: string) {
    return (this.command === command && this.allowedChannelTypes.indexOf(channelType) >= 0);
  }
  public getSessionType() {
    return this.sessionType;
  }
}

export default AbstractHandler;