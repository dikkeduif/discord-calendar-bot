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

import { SlashCommandBuilder, InteractionContextType } from 'discord.js';

/**
 * The bot's full global command set. Registration bulk-overwrites with
 * exactly this list, so removing a definition here also removes it from
 * Discord on the next drift-triggered registration.
 */
export function buildCommandDefinitions() {
  const event = new SlashCommandBuilder()
    .setName('event')
    .setDescription('Create and manage calendar events')
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((sub) => sub
      .setName('create')
      .setDescription('Create a new event in this channel'))
    .addSubcommand((sub) => sub
      .setName('modify')
      .setDescription('Modify one of your upcoming events')
      .addStringOption((option) => option
        .setName('event')
        .setDescription('The event to modify')
        .setRequired(true)
        .setAutocomplete(true)))
    .addSubcommand((sub) => sub
      .setName('delete')
      .setDescription('Delete one of your upcoming events')
      .addStringOption((option) => option
        .setName('event')
        .setDescription('The event to delete')
        .setRequired(true)
        .setAutocomplete(true)));

  const timezone = new SlashCommandBuilder()
    .setName('timezone')
    .setDescription('Your timezone, used to read the dates and times you type')
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((sub) => sub
      .setName('set')
      .setDescription('Set your timezone for this server')
      .addStringOption((option) => option
        .setName('zone')
        .setDescription('IANA zone name, e.g. Europe/Brussels')
        .setRequired(true)
        .setAutocomplete(true)));

  const help = new SlashCommandBuilder()
    .setName('help')
    .setDescription('How to use the calendar bot')
    .setContexts(InteractionContextType.Guild);

  return [event.toJSON(), timezone.toJSON(), help.toJSON()];
}
