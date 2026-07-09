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
import { Event, EventModel } from '../Models/Event';
import { UserModel } from '../Models/User';
import Message from '../Classes/Message';
import DateValidation from '../Validation/DateValidation';
import Settings from '../../settings';
import Logger from '../../Bot/Logger';
import { Dictionary, CalendarTranslations } from '../../Dictionaries';

export const MODIFY_MODAL_NAMESPACE = 'ev:mmodal';

const MAX_CHOICE_NAME_LENGTH = 100;
const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 3900;

export interface ReminderChange {
  changed: boolean;
  reminder?: number | null;
  error?: boolean;
}

export default class ModifyCommand {
  public static formatChoiceName(event: Event): string {
    const time = moment_tz(event.eventDate).tz(event.eventTimeZone).format('DD-MM HH:mm');
    const suffix = ' — ' + time + ' (' + event.shortId + ')';
    const title = (event.title ?? '').slice(0, MAX_CHOICE_NAME_LENGTH - suffix.length);
    return title + suffix;
  }

  /**
   * Reminder field semantics: blank leaves the reminder alone, 0 turns
   * it off, a positive integer sets minutes-before-start.
   */
  public static resolveReminderChange(input: string, current: number | undefined): ReminderChange {
    const trimmed = (input ?? '').trim();
    if (trimmed.length === 0) {
      return { changed: false };
    }
    if (!/^\d+$/.test(trimmed)) {
      return { changed: false, error: true };
    }

    const minutes = parseInt(trimmed, 10);
    if (minutes === 0) {
      return current ? { changed: true, reminder: null } : { changed: false };
    }
    if (minutes === current) {
      return { changed: false };
    }
    return { changed: true, reminder: minutes };
  }

  private dictionary: Dictionary;

  constructor() {
    this.dictionary = new Dictionary(CalendarTranslations);
  }

  /**
   * Autocomplete for both /event modify and /event delete. Whatever
   * happens, an answer leaves within the 3-second window.
   */
  public async autocomplete(interaction: Discord.AutocompleteInteraction) {
    let choices: Discord.ApplicationCommandOptionChoiceData[] = [];

    try {
      const events = await EventModel.getUpcomingGuildEvents(interaction.user.id, interaction.guildId);
      const focused = interaction.options.getFocused().toLowerCase();

      choices = events
        .map((event) => ({ name: ModifyCommand.formatChoiceName(event), value: event.shortId }))
        .filter((choice) => focused.length === 0 || choice.name.toLowerCase().includes(focused));
    } catch (err) {
      Logger.error('Event autocomplete failed: ' + err.message);
    }

    await interaction.respond(choices.slice(0, 25));
  }

  public async execute(interaction: Discord.ChatInputCommandInteraction) {
    // Autocomplete values are suggestions, not guarantees: users can
    // submit free text, and the picked event can vanish in between
    const shortId = interaction.options.getString('event');
    const event = await EventModel.getByShortId(shortId, interaction.user.id);

    if (event === null) {
      await interaction.reply({
        content: this.dictionary.get('/calendar/interaction/eventGone'),
        flags: Discord.MessageFlags.Ephemeral,
      });
      return;
    }

    const timezone = await this.resolveTimezone(interaction, event);
    const local = moment_tz(event.eventDate).tz(timezone);

    await interaction.showModal(this.buildModal(event, local.format('DD-MM-YYYY'), local.format('HH:mm'), timezone));
  }

  public async handleModalSubmit(interaction: Discord.ModalSubmitInteraction) {
    await interaction.deferReply({ flags: Discord.MessageFlags.Ephemeral });

    const shortId = interaction.customId.split(':')[2];
    const event = await EventModel.getByShortId(shortId, interaction.user.id);

    if (event === null) {
      await interaction.editReply({ content: this.dictionary.get('/calendar/interaction/eventGone') });
      return;
    }

    const title = interaction.fields.getTextInputValue('title').trim().slice(0, MAX_TITLE_LENGTH);
    const description = interaction.fields.getTextInputValue('description').trim().slice(0, MAX_DESCRIPTION_LENGTH);
    const date = interaction.fields.getTextInputValue('date').trim();
    const time = interaction.fields.getTextInputValue('time').trim();

    const timezone = await this.resolveTimezone(interaction, event);

    let eventDate: Date;
    try {
      eventDate = DateValidation.validate(date + ' ' + time, timezone).toDate();
    } catch (e) {
      await interaction.editReply({ content: e.message });
      return;
    }

    const reminderChange = ModifyCommand.resolveReminderChange(
      interaction.fields.getTextInputValue('reminder'), event.reminder);
    if (reminderChange.error) {
      await interaction.editReply({ content: this.dictionary.get('/calendar/interaction/reminderInvalid') });
      return;
    }

    const dateChanged = eventDate.getTime() !== event.eventDate.getTime();

    const update: any = { title, description, eventDate };
    if (reminderChange.changed) {
      update.reminder = reminderChange.reminder;
    }
    if (dateChanged || reminderChange.changed) {
      // Re-arm the reminder: a rescheduled event should remind again
      update.reminderSent = null;
    }

    await EventModel.findOneAndUpdate({ shortId, authorId: interaction.user.id }, update);

    event.title = title;
    event.description = description;
    event.eventDate = eventDate;

    const messageUpdated = await new Message(interaction.client, event.messageId).updateEventMessage(event);

    const responseKey = messageUpdated
      ? '/calendar/interaction/modifyUpdated'
      : '/calendar/interaction/modifyMessageGone';
    await interaction.editReply({ content: this.dictionary.get(responseKey) });
  }

  private buildModal(event: Event, date: string, time: string, timezone: string): Discord.ModalBuilder {
    const textInput = (id: string, style: Discord.TextInputStyle, required: boolean, maxLength: number, value: string) => {
      const input = new Discord.TextInputBuilder()
        .setCustomId(id)
        .setStyle(style)
        .setRequired(required)
        .setMaxLength(maxLength);
      if (value.length > 0) {
        input.setValue(value.slice(0, maxLength));
      }
      return input;
    };

    return new Discord.ModalBuilder()
      .setCustomId(MODIFY_MODAL_NAMESPACE + ':' + event.shortId)
      .setTitle(this.dictionary.get('/calendar/interaction/modifyModalTitle'))
      .addLabelComponents(
        new Discord.LabelBuilder()
          .setLabel(this.dictionary.get('/calendar/interaction/fieldTitle'))
          .setTextInputComponent(textInput('title', Discord.TextInputStyle.Short, true, MAX_TITLE_LENGTH, event.title ?? '')),
        new Discord.LabelBuilder()
          .setLabel(this.dictionary.get('/calendar/interaction/fieldDescription'))
          .setTextInputComponent(textInput('description', Discord.TextInputStyle.Paragraph, true, MAX_DESCRIPTION_LENGTH, event.description ?? '')),
        new Discord.LabelBuilder()
          .setLabel(this.dictionary.get('/calendar/interaction/fieldDate'))
          .setDescription(this.dictionary.get('/calendar/interaction/fieldDateHint').replace('{timezone}', timezone))
          .setTextInputComponent(textInput('date', Discord.TextInputStyle.Short, true, 10, date)),
        new Discord.LabelBuilder()
          .setLabel(this.dictionary.get('/calendar/interaction/fieldTime'))
          .setTextInputComponent(textInput('time', Discord.TextInputStyle.Short, true, 5, time)),
        new Discord.LabelBuilder()
          .setLabel(this.dictionary.get('/calendar/interaction/fieldReminder'))
          .setDescription(this.dictionary.get('/calendar/interaction/fieldReminderHint'))
          .setTextInputComponent(textInput('reminder', Discord.TextInputStyle.Short, false, 6,
            event.reminder ? event.reminder.toString() : '')),
      );
  }

  /**
   * Pre-fill and re-parse share one zone: the creator's current record,
   * falling back to the event's snapshot, then the bot default.
   */
  private async resolveTimezone(interaction: Discord.ChatInputCommandInteraction | Discord.ModalSubmitInteraction, event: Event): Promise<string> {
    const user = await UserModel.getUserByUserAndGuildId(interaction.user.id, interaction.guildId);
    if (user !== null && user.userTimeZone) {
      return user.userTimeZone;
    }
    if (event.userTimeZone) {
      return event.userTimeZone;
    }
    return Settings.get('/defaultTimeZone');
  }
}
