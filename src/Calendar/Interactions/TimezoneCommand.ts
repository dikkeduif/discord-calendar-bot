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
import moment_tz from 'moment-timezone';
import { User, UserModel } from '../Models/User';
import DateValidation from '../Validation/DateValidation';
import Settings from '../../settings';
import Logger from '../../Bot/Logger';
import { Dictionary, CalendarTranslations } from '../../Dictionaries';

const MAX_CHOICES = 25;

export default class TimezoneCommand {
  public static filterZones(query: string): string[] {
    const needle = (query ?? '').toLowerCase();
    return moment_tz.tz.names()
      .filter((zone) => zone.toLowerCase().includes(needle))
      .slice(0, MAX_CHOICES);
  }

  private dictionary: Dictionary;

  constructor() {
    this.dictionary = new Dictionary(CalendarTranslations);
  }

  public async autocomplete(interaction: Discord.AutocompleteInteraction) {
    let choices: Discord.ApplicationCommandOptionChoiceData[] = [];

    try {
      choices = TimezoneCommand.filterZones(interaction.options.getFocused())
        .map((zone) => ({ name: zone, value: zone }));
    } catch (err) {
      Logger.error('Timezone autocomplete failed: ' + err.message);
    }

    await interaction.respond(choices);
  }

  public async execute(interaction: Discord.ChatInputCommandInteraction) {
    // Autocomplete is a suggestion, not a guarantee — free-typed input
    // lands here too
    const zone = interaction.options.getString('zone');

    if (!DateValidation.isValidTimeZone(zone)) {
      await interaction.reply({
        content: this.dictionary.get('/calendar/creation/invalidTimeZone'),
        flags: Discord.MessageFlags.Ephemeral,
      });
      return;
    }

    const existing = await UserModel.getUserByUserAndGuildId(interaction.user.id, interaction.guildId);
    const previous = existing !== null && existing.userTimeZone
      ? existing.userTimeZone
      : Settings.get('/defaultTimeZone') + ' (default)';

    if (existing === null) {
      // Reminders format with eventTimeZone, so a record born here must
      // carry both fields — exactly like the retired DM interview did
      const newUser: User = {};
      newUser.guildId = interaction.guildId;
      newUser.userId = interaction.user.id;
      newUser.active = true;
      newUser.userTimeZone = zone;
      newUser.eventTimeZone = Settings.get('/defaultTimeZone');
      await new UserModel(newUser).save();
    } else {
      await UserModel.findOneAndUpdate(
        { userId: interaction.user.id, guildId: interaction.guildId },
        { userTimeZone: zone });
    }

    let msg = this.dictionary.get('/calendar/interaction/timezoneSet');
    msg = msg.replace('{zone}', zone).replace('{previous}', previous);
    await interaction.reply({ content: msg, flags: Discord.MessageFlags.Ephemeral });
  }
}
