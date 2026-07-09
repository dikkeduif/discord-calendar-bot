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
import * as Emoji from 'node-emoji';
import { Event, EventModel } from '../Models/Event';
import RegistrationRenderer from '../Classes/RegistrationRenderer';
import Logger from '../../Bot/Logger';
import { Dictionary, CalendarTranslations } from '../../Dictionaries';

const MAX_BUTTONS_PER_ROW = 5;
const MAX_LABEL_LENGTH = 80;

export default class RegistrationButtonHandler {
  /**
   * Options are encoded by position, not by key: custom emoji keys
   * contain ':' and can approach the 100-char customId limit. Safe
   * because options are immutable once an event is posted; the decline
   * choice gets an explicit marker so it survives independent of order.
   */
  public static encodeCustomId(shortId: string, index: number | 'decline'): string {
    return 'ev:reg:' + shortId + ':' + (index === 'decline' ? 'd' : index);
  }

  public static decodeCustomId(customId: string): { shortId: string, index: number | 'decline' } | null {
    const parts = customId.split(':');
    if (parts.length !== 4 || parts[0] !== 'ev' || parts[1] !== 'reg') {
      return null;
    }
    if (parts[3] === 'd') {
      return { shortId: parts[2], index: 'decline' };
    }
    if (!/^\d+$/.test(parts[3])) {
      return null;
    }
    return { shortId: parts[2], index: parseInt(parts[3], 10) };
  }

  public static buildButtonRows(event: Event): Array<Discord.ActionRowBuilder<Discord.ButtonBuilder>> {
    if (!event.hasOptions()) {
      return [];
    }

    const rows: Array<Discord.ActionRowBuilder<Discord.ButtonBuilder>> = [];
    let currentRow = new Discord.ActionRowBuilder<Discord.ButtonBuilder>();
    let index = 0;

    for (const [key, label] of event.options) {
      const isDecline = key === event.declineOption;
      const text = (label ?? '').trim();

      const button = new Discord.ButtonBuilder()
        .setCustomId(RegistrationButtonHandler.encodeCustomId(event.shortId, isDecline ? 'decline' : index))
        .setLabel((text.length > 0 ? text : key).slice(0, MAX_LABEL_LENGTH))
        .setStyle(isDecline ? Discord.ButtonStyle.Danger : Discord.ButtonStyle.Secondary);

      const emoji = RegistrationButtonHandler.resolveButtonEmoji(key);
      if (emoji !== null) {
        button.setEmoji(emoji);
      }

      if (currentRow.components.length === MAX_BUTTONS_PER_ROW) {
        rows.push(currentRow);
        currentRow = new Discord.ActionRowBuilder<Discord.ButtonBuilder>();
      }
      currentRow.addComponents(button);
      index++;
    }

    if (currentRow.components.length > 0) {
      rows.push(currentRow);
    }

    return rows;
  }

  /**
   * Option keys come in three legacy shapes: unicode emoji, custom
   * '<a:name:id>' strings, and bare node-emoji shortcode names. A key
   * that resolves to none of these renders as a label-only button
   * rather than failing the whole post.
   */
  public static resolveButtonEmoji(key: string): Discord.APIMessageComponentEmoji | null {
    const custom = key.match(/^<(a?):(\w+):(\d+)>$/);
    if (custom) {
      return { animated: custom[1] === 'a', name: custom[2], id: custom[3] };
    }
    if (/\p{Extended_Pictographic}/u.test(key)) {
      return { name: key };
    }
    if (Emoji.has(key)) {
      return { name: Emoji.get(key) };
    }
    return null;
  }

  private dictionary: Dictionary;

  constructor() {
    this.dictionary = new Dictionary(CalendarTranslations);
  }

  public async execute(interaction: Discord.ButtonInteraction) {
    const decoded = RegistrationButtonHandler.decodeCustomId(interaction.customId);
    if (decoded === null) {
      return;
    }

    // Ack inside the 3-second window before any fetches
    await interaction.deferUpdate();

    const event = await EventModel.getByMessageId(interaction.message.id);

    if (event === null || !event.active || (event.eventDate && event.eventDate.getTime() < Date.now())) {
      await this.closeRegistration(interaction);
      return;
    }

    const keys = Array.from(event.options ? event.options.keys() : []);
    const optionKey = decoded.index === 'decline' ? event.declineOption : keys[decoded.index];

    if (!optionKey || !event.options || !event.options.get(optionKey)) {
      return;
    }

    // Atomic keyed update so two simultaneous clicks cannot overwrite
    // each other; re-use the returned document so the embed rebuild also
    // reflects registrations written by concurrent clicks
    const updated = await EventModel.findByIdAndUpdate(
      event._id,
      { $set: { ['registrations.' + interaction.user.id]: optionKey } },
      { new: true });

    if (updated && updated.registrations) {
      event.registrations = updated.registrations;
    } else {
      if (!event.registrations) {
        event.registrations = new Map<string, string>();
      }
      event.registrations.set(interaction.user.id, optionKey);
    }

    const fields = await RegistrationRenderer.renderFields(interaction.client, interaction.guild, event);
    const embed = Discord.EmbedBuilder.from(interaction.message.embeds[0]).setFields(fields);

    // Components are left untouched by omitting them from the edit
    await interaction.editReply({ embeds: [embed] });
  }

  private async closeRegistration(interaction: Discord.ButtonInteraction) {
    await interaction.followUp({
      content: this.dictionary.get('/calendar/interaction/registrationClosed'),
      flags: Discord.MessageFlags.Ephemeral,
    });

    // Best effort: grey the buttons so the message stops inviting clicks
    try {
      const disabledRows = interaction.message.components.map((row: any) =>
        new Discord.ActionRowBuilder<Discord.ButtonBuilder>().addComponents(
          row.components.map((component: any) => Discord.ButtonBuilder.from(component).setDisabled(true))));
      await interaction.editReply({ components: disabledRows });
    } catch (err) {
      Logger.error('Could not disable registration buttons: ' + err.message);
    }
  }
}
