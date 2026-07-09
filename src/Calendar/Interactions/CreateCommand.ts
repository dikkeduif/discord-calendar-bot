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
import { customAlphabet } from 'nanoid';
import { Event, EventModel, OptionsType } from '../Models/Event';
import { UserModel } from '../Models/User';
import Message from '../Classes/Message';
import DateValidation from '../Validation/DateValidation';
import OptionsFieldParser, { ParseResult } from './OptionsFieldParser';
import SessionType from '../Enums/SessionType';
import EventCreationProgress from '../Enums/EventCreationProgress';
import Settings from '../../settings';
import { Dictionary, CalendarTranslations } from '../../Dictionaries';

export const CREATE_MODAL_ID = 'ev:cmodal';
export const CREATE_RETRY_ID = 'ev:retry:create';

const STASH_TTL_MS = 15 * 60 * 1000;
const MAX_TITLE_LENGTH = 200;
// Embed descriptions cap at 4096 including the appended Time block
const MAX_DESCRIPTION_LENGTH = 3900;
// Message content caps at 2000; the value echo must leave room for the
// error text above it
const MAX_ECHO_LENGTH = 1500;

interface DraftValues {
  title: string;
  description: string;
  date: string;
  time: string;
  options: string;
  savedAt: number;
}

export default class CreateCommand {
  private dictionary: Dictionary;
  private nanoid: (size?: number) => string;
  // Failed-validation input, so the retry button can re-open a
  // pre-filled modal. In-memory on purpose: a restart costs the user a
  // copy/paste from the error echo, not their input
  private drafts: Map<string, DraftValues>;

  constructor() {
    this.dictionary = new Dictionary(CalendarTranslations);
    this.nanoid = customAlphabet('1234567890abcdefghijklmnopqrstuvwxyz', 6);
    this.drafts = new Map<string, DraftValues>();
  }

  public async execute(interaction: Discord.ChatInputCommandInteraction) {
    const channel = interaction.channel;

    // Aligned with the reminder loop, which only sends in GuildText
    if (!channel || channel.type !== Discord.ChannelType.GuildText) {
      await interaction.reply({
        content: this.dictionary.get('/calendar/interaction/wrongChannel'),
        flags: Discord.MessageFlags.Ephemeral,
      });
      return;
    }

    // Cache-only checks: showModal must be the first response, so there
    // is no room for fetches here
    const me = interaction.guild.members.me;
    const botPermissions = me !== null ? channel.permissionsFor(me) : null;
    if (botPermissions === null || !botPermissions.has([
      Discord.PermissionFlagsBits.ViewChannel,
      Discord.PermissionFlagsBits.SendMessages,
      Discord.PermissionFlagsBits.EmbedLinks,
    ])) {
      await interaction.reply({
        content: this.dictionary.get('/calendar/interaction/noBotPermissions'),
        flags: Discord.MessageFlags.Ephemeral,
      });
      return;
    }

    // Parity with the prefix flow: creating in a channel requires being
    // able to speak in it (slash commands would otherwise bypass that)
    if (!interaction.memberPermissions || !interaction.memberPermissions.has(Discord.PermissionFlagsBits.SendMessages)) {
      await interaction.reply({
        content: this.dictionary.get('/calendar/interaction/noUserPermissions'),
        flags: Discord.MessageFlags.Ephemeral,
      });
      return;
    }

    const draft = this.getFreshDraft(this.draftKey(interaction));
    await interaction.showModal(this.buildModal(draft));
  }

  public async handleRetry(interaction: Discord.ButtonInteraction) {
    const draft = this.getFreshDraft(this.draftKey(interaction));

    if (draft === null) {
      // The echoed values above the button still hold their input
      await interaction.reply({
        content: this.dictionary.get('/calendar/interaction/retryExpired'),
        flags: Discord.MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.showModal(this.buildModal(draft));
  }

  public async handleModalSubmit(interaction: Discord.ModalSubmitInteraction) {
    // Ack before any work: an unacknowledged submit keeps the modal open
    // client-side and invites double submissions
    await interaction.deferReply({ flags: Discord.MessageFlags.Ephemeral });

    const values: DraftValues = {
      title: interaction.fields.getTextInputValue('title').trim(),
      description: interaction.fields.getTextInputValue('description').trim(),
      date: interaction.fields.getTextInputValue('date').trim(),
      time: interaction.fields.getTextInputValue('time').trim(),
      options: interaction.fields.getTextInputValue('options'),
      savedAt: Date.now(),
    };

    const key = this.draftKey(interaction);

    const user = await UserModel.getUserByUserAndGuildId(interaction.user.id, interaction.guildId);
    const timezone = user !== null && user.userTimeZone ? user.userTimeZone : Settings.get('/defaultTimeZone');

    let eventDate: Date;
    try {
      eventDate = DateValidation.validate(values.date + ' ' + values.time, timezone).toDate();
    } catch (e) {
      await this.failValidation(interaction, key, values, e.message);
      return;
    }

    const parsed = OptionsFieldParser.parse(values.options, interaction.client, '❎');
    if (!parsed.ok) {
      await this.failValidation(interaction, key, values, this.optionsErrorMessage(parsed));
      return;
    }

    const event = new Event();
    event.sessionType = SessionType.CREATE;
    event.status = EventCreationProgress.Done;
    event.active = true;
    event.authorId = interaction.user.id;
    event.authorName = interaction.user.username;
    event.channelId = interaction.channelId;
    event.guildId = interaction.guildId;
    event.guildName = interaction.guild.name;
    event.title = values.title.slice(0, MAX_TITLE_LENGTH);
    event.description = values.description.slice(0, MAX_DESCRIPTION_LENGTH);
    event.eventDate = eventDate;
    event.userTimeZone = timezone;
    event.eventTimeZone = user !== null && user.eventTimeZone ? user.eventTimeZone : Settings.get('/defaultTimeZone');

    if (parsed.options.size === 0) {
      event.setDefaultOptions();
      event.optionsType = OptionsType.default;
    } else {
      event.options = parsed.options;
      event.optionsType = OptionsType.custom;
    }
    event.setDefaultDecline(this.dictionary.get('/calendar/interaction/declineLabel'));

    // shortId is unique-indexed; regenerate on the (unlikely) collision
    let saved = null;
    for (let attempt = 0; attempt < 3 && saved === null; attempt++) {
      event.shortId = this.nanoid();
      try {
        saved = await EventModel.create(event);
      } catch (err) {
        if (err.code !== 11000) {
          throw err;
        }
      }
    }
    if (saved === null) {
      throw new Error('Could not allocate a unique event id');
    }

    await new Message(interaction.client, '').postNewMessageAndUpdate(saved);

    if (!saved.messageId) {
      // Post failure is contained inside Message; compensate so the
      // reminder loop never sees a ghost event without a message
      saved.active = false;
      await saved.save();
      await interaction.editReply({ content: this.dictionary.get('/calendar/interaction/postFailed') });
      return;
    }

    await saved.save();
    this.drafts.delete(key);

    let msg = this.dictionary.get('/calendar/interaction/created');
    msg = msg.replace(/\{id\}/g, saved.shortId);
    if (user === null) {
      msg += '\n' + this.dictionary.get('/calendar/interaction/timezoneNotice').replace('{timezone}', timezone);
    }
    await interaction.editReply({ content: msg });
  }

  private buildModal(draft: DraftValues | null): Discord.ModalBuilder {
    const textInput = (id: string, style: Discord.TextInputStyle, required: boolean, maxLength: number, value?: string, placeholder?: string) => {
      const input = new Discord.TextInputBuilder()
        .setCustomId(id)
        .setStyle(style)
        .setRequired(required)
        .setMaxLength(maxLength);
      if (value !== undefined && value.length > 0) {
        input.setValue(value.slice(0, maxLength));
      }
      if (placeholder !== undefined) {
        input.setPlaceholder(placeholder);
      }
      return input;
    };

    return new Discord.ModalBuilder()
      .setCustomId(CREATE_MODAL_ID)
      .setTitle(this.dictionary.get('/calendar/interaction/modalTitle'))
      .addLabelComponents(
        new Discord.LabelBuilder()
          .setLabel(this.dictionary.get('/calendar/interaction/fieldTitle'))
          .setTextInputComponent(textInput('title', Discord.TextInputStyle.Short, true, MAX_TITLE_LENGTH, draft?.title)),
        new Discord.LabelBuilder()
          .setLabel(this.dictionary.get('/calendar/interaction/fieldDescription'))
          .setTextInputComponent(textInput('description', Discord.TextInputStyle.Paragraph, true, MAX_DESCRIPTION_LENGTH, draft?.description)),
        new Discord.LabelBuilder()
          .setLabel(this.dictionary.get('/calendar/interaction/fieldDate'))
          .setTextInputComponent(textInput('date', Discord.TextInputStyle.Short, true, 10, draft?.date, '14-07-2026')),
        new Discord.LabelBuilder()
          .setLabel(this.dictionary.get('/calendar/interaction/fieldTime'))
          .setTextInputComponent(textInput('time', Discord.TextInputStyle.Short, true, 5, draft?.time, '20:30')),
        new Discord.LabelBuilder()
          .setLabel(this.dictionary.get('/calendar/interaction/fieldOptions'))
          .setDescription(this.dictionary.get('/calendar/interaction/fieldOptionsHint'))
          .setTextInputComponent(textInput('options', Discord.TextInputStyle.Paragraph, false, 2000, draft?.options)),
      );
  }

  private async failValidation(interaction: Discord.ModalSubmitInteraction, key: string, values: DraftValues, message: string) {
    this.drafts.set(key, values);

    const retryRow = new Discord.ActionRowBuilder<Discord.ButtonBuilder>().addComponents(
      new Discord.ButtonBuilder()
        .setCustomId(CREATE_RETRY_ID)
        .setLabel(this.dictionary.get('/calendar/interaction/retryLabel'))
        .setStyle(Discord.ButtonStyle.Primary));

    await interaction.editReply({
      content: message + '\n\n' + this.echoValues(values),
      components: [retryRow],
    });
  }

  private echoValues(values: DraftValues): string {
    const echo = this.dictionary.get('/calendar/interaction/yourInput') + '\n'
      + '**' + values.date + ' ' + values.time + '** — **' + values.title + '**\n'
      + values.description
      + (values.options.trim().length > 0 ? '\n\n' + values.options : '');
    return echo.length > MAX_ECHO_LENGTH ? echo.slice(0, MAX_ECHO_LENGTH) + '…' : echo;
  }

  private optionsErrorMessage(parsed: ParseResult): string {
    if (parsed.ok) {
      return '';
    }
    const keyByReason = {
      invalidEmoji: '/calendar/interaction/optionsInvalidEmoji',
      missingLabel: '/calendar/interaction/optionsMissingLabel',
      labelTooLong: '/calendar/interaction/optionsLabelTooLong',
      duplicate: '/calendar/interaction/optionsDuplicate',
      declineCollision: '/calendar/interaction/optionsDeclineCollision',
      tooMany: '/calendar/interaction/optionsTooMany',
    };
    return this.dictionary.get(keyByReason[parsed.reason]).replace('{line}', parsed.line);
  }

  private draftKey(interaction: Discord.Interaction): string {
    return interaction.user.id + ':' + interaction.guildId;
  }

  private getFreshDraft(key: string): DraftValues | null {
    const draft = this.drafts.get(key);
    if (draft === undefined) {
      return null;
    }
    if (Date.now() - draft.savedAt > STASH_TTL_MS) {
      this.drafts.delete(key);
      return null;
    }
    return draft;
  }
}
