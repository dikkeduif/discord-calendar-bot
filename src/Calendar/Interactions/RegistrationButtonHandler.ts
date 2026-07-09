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
      // Messages cap at 25 buttons; the slash parser prevents this, but
      // the legacy interview never bounded the option count
      if (index === 25) {
        break;
      }

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

    if (event === null) {
      // Both create flows post the message before the record is findable
      // by messageId (save→post→patch, and the legacy interview persists
      // on session finish). A click in that window must not brick the
      // buttons, so a missing record never disables components — only an
      // authoritative record (below) may do that
      const messageAgeMs = Date.now() - interaction.message.createdTimestamp;
      const contentKey = messageAgeMs < 60 * 1000
        ? '/calendar/interaction/registrationPending'
        : '/calendar/interaction/registrationClosed';
      await interaction.followUp({
        content: this.dictionary.get(contentKey),
        flags: Discord.MessageFlags.Ephemeral,
      });
      return;
    }

    if (!event.active || (event.eventDate && event.eventDate.getTime() < Date.now())) {
      // The record is authoritative here, so greying the buttons is safe
      await this.closeRegistration(interaction);
      return;
    }

    const keys = Array.from(event.options ? event.options.keys() : []);
    const optionKey = decoded.index === 'decline' ? event.declineOption : keys[decoded.index];

    if (!optionKey || !event.options || !event.options.get(optionKey)) {
      return;
    }

    // Atomic keyed update so two simultaneous clicks cannot overwrite
    // each other; the active filter loses the race against a concurrent
    // delete/detach instead of resurrecting a registration onto it
    const updated = await EventModel.findOneAndUpdate(
      { _id: event._id, active: true },
      { $set: { ['registrations.' + interaction.user.id]: optionKey } },
      { new: true });

    if (updated === null) {
      await this.closeRegistration(interaction);
      return;
    }

    if (updated.registrations) {
      event.registrations = updated.registrations;
    }

    const fields = await RegistrationRenderer.renderFields(interaction.client, interaction.guild, event);
    const embed = Discord.EmbedBuilder.from(interaction.message.embeds[0]).setFields(fields);

    try {
      // Components are left untouched by omitting them from the edit
      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      // The message can vanish mid-flight (concurrent delete); the
      // registration write itself already lost or won atomically
      if (err.code === Discord.RESTJSONErrorCodes.UnknownMessage) {
        Logger.debug('Event message gone before embed update: ' + interaction.message.id);
        return;
      }
      throw err;
    }
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
