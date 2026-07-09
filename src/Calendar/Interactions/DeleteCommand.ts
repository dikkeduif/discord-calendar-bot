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
import { EventModel } from '../Models/Event';
import AdminActions from '../Services/AdminActions';
import { Dictionary, CalendarTranslations } from '../../Dictionaries';

export const DELETE_CONFIRM_NAMESPACE = 'ev:del';

export default class DeleteCommand {
  private dictionary: Dictionary;

  constructor() {
    this.dictionary = new Dictionary(CalendarTranslations);
  }

  public async execute(interaction: Discord.ChatInputCommandInteraction) {
    const shortId = interaction.options.getString('event');
    const event = await EventModel.getByShortId(shortId, interaction.user.id);

    if (event === null) {
      await interaction.reply({
        content: this.dictionary.get('/calendar/interaction/eventGone'),
        flags: Discord.MessageFlags.Ephemeral,
      });
      return;
    }

    const confirmRow = new Discord.ActionRowBuilder<Discord.ButtonBuilder>().addComponents(
      new Discord.ButtonBuilder()
        // shortId in the customId keeps the confirm stateless: it still
        // works after a bot restart
        .setCustomId(DELETE_CONFIRM_NAMESPACE + ':' + event.shortId)
        .setLabel(this.dictionary.get('/calendar/interaction/deleteConfirmLabel'))
        .setStyle(Discord.ButtonStyle.Danger));

    await interaction.reply({
      content: this.dictionary.get('/calendar/interaction/deleteConfirm').replace('{title}', event.title),
      components: [confirmRow],
      flags: Discord.MessageFlags.Ephemeral,
    });
  }

  public async handleConfirm(interaction: Discord.ButtonInteraction) {
    const shortId = interaction.customId.split(':')[2];
    const event = await EventModel.getByShortId(shortId, interaction.user.id);

    // Idempotent: a second click, or a confirm on an event someone
    // already deleted, reports instead of failing
    if (event === null) {
      await interaction.update({
        content: this.dictionary.get('/calendar/interaction/deleteAlready'),
        components: [],
      });
      return;
    }

    // Ack first: deleting touches the channel, the message, and the
    // native scheduled event
    await interaction.deferUpdate();

    await new AdminActions(interaction.client).deleteEvent(shortId, {
      ownerBypass: false,
      authorId: interaction.user.id,
    });

    await interaction.editReply({
      content: this.dictionary.get('/calendar/interaction/deleteDone').replace('{title}', event.title),
      components: [],
    });
  }
}
