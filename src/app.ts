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
import { Calendar } from './Calendar'
import Logger from './Bot/Logger';
import Settings from './settings';
import mongoose from './Entities/Mongoose';

const client = new Discord.Client({ partials: ['MESSAGE', 'REACTION', 'CHANNEL']});

client.on('ready', () => {
  Logger.info('Discord client connected');
  Logger.info(`Found environment ${Settings.get('/environment')}`);
});

const calendar = new Calendar(client);
calendar.start();

client.on('message', message => {
  if (!message.author.bot) {
    calendar.processMessage(message).then((res) => {
      Logger.debug(res);
    });
  }
});

client.on('messageReactionAdd', (reaction, user) => {
  if (!user.bot) {
    calendar.reactionAdded(reaction, user).then((res) => {
      Logger.debug(res);
    });
  }
});

client.on('messageReactionRemove', (reaction, user) => {
  if (!user.bot) {
    calendar.reactionRemoved(reaction, user).then((res) => {
      Logger.debug(res);
    });
  }
});

client.login(Settings.get('/discord/token')).then((res) => {
  Logger.info(`Connecting to discord`);
});
