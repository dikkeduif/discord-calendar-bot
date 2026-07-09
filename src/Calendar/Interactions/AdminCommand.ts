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
import AdminActions, { ActionOutcome } from '../Services/AdminActions';
import ChannelStateCache from '../Services/ChannelStateCache';
import ModifyCommand from './ModifyCommand';
import Logger from '../../Bot/Logger';
import { Dictionary, CalendarTranslations } from '../../Dictionaries';

export const ADMIN_BUTTON_NAMESPACE = 'ev:adm';

const MAX_ROWS_PER_REPLY = 25;
const MAX_CHARS_PER_REPLY = 1900;

export default class AdminCommand {
  public static isOwner(userId: string | undefined, ownerId: string | undefined): boolean {
    return !!ownerId && !!userId && userId === ownerId;
  }

  public static isSnowflake(value: string | undefined): boolean {
    return /^\d{17,20}$/.test(value ?? '');
  }

  /**
   * Packs report lines into ≤maxChars messages, capping the row count
   * with an honest overflow note (ephemeral replies cap at 2000 chars).
   */
  public static chunkLines(lines: string[], maxChars: number, maxRows?: number): string[] {
    let capped = lines;
    if (maxRows !== undefined && lines.length > maxRows) {
      capped = lines.slice(0, maxRows);
      capped.push('…and ' + (lines.length - maxRows) + ' more — see the dashboard');
    }

    const chunks: string[] = [];
    let current = '';
    for (const line of capped) {
      if (current.length > 0 && current.length + line.length + 1 > maxChars) {
        chunks.push(current);
        current = '';
      }
      current = current.length > 0 ? current + '\n' + line : line;
    }
    if (current.length > 0) {
      chunks.push(current);
    }
    return chunks;
  }

  private dictionary: Dictionary;

  constructor() {
    this.dictionary = new Dictionary(CalendarTranslations);
  }

  public async execute(interaction: Discord.ChatInputCommandInteraction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'guilds') {
      await this.showGuilds(interaction);
    } else if (subcommand === 'events') {
      await this.showEvents(interaction);
    } else if (subcommand === 'leave') {
      await this.confirmLeave(interaction);
    } else if (subcommand === 'detach') {
      await this.detach(interaction);
    } else if (subcommand === 'reattach') {
      await this.reattach(interaction);
    }
  }

  public async autocomplete(interaction: Discord.AutocompleteInteraction) {
    const focused = interaction.options.getFocused(true);
    const query = String(focused.value).toLowerCase();
    let choices: Discord.ApplicationCommandOptionChoiceData[] = [];

    if (focused.name === 'guild') {
      choices = interaction.client.guilds.cache.map((guild) => ({
        name: (guild.name + ' (' + guild.id + ')').slice(0, 100),
        value: guild.id,
      }));
    } else if (focused.name === 'channel') {
      const subcommand = interaction.options.getSubcommand();
      if (subcommand === 'reattach') {
        // Only blocked channels make sense here
        choices = ChannelStateCache.entries().map((entry) => ({
          name: (this.describeChannel(interaction.client, entry.channelId) + ' — ' + entry.state).slice(0, 100),
          value: entry.channelId,
        }));
      } else {
        const guild = interaction.guild;
        choices = guild === null ? [] : guild.channels.cache
          .filter((channel) => channel.type === Discord.ChannelType.GuildText)
          .map((channel) => ({ name: ('#' + channel.name).slice(0, 100), value: channel.id }));
      }
    }

    await interaction.respond(
      choices.filter((choice) => query.length === 0 || choice.name.toLowerCase().includes(query)).slice(0, 25));
  }

  public async handleButton(interaction: Discord.ButtonInteraction) {
    const parts = interaction.customId.split(':');

    if (parts[2] === 'leave' && AdminCommand.isSnowflake(parts[3])) {
      await interaction.deferUpdate();
      const outcome = await new AdminActions(interaction.client).leaveGuild(parts[3]);
      Logger.info('Admin action', { action: 'leaveGuild', target: parts[3], surface: 'discord', outcome: outcome.status });
      await interaction.editReply({ content: this.leaveOutcomeMessage(outcome, parts[3]), components: [] });
    }
  }

  private async showGuilds(interaction: Discord.ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: Discord.MessageFlags.Ephemeral });

    const counts = await EventModel.getActiveCountsByGuild();

    const lines = interaction.client.guilds.cache.map((guild) =>
      '**' + guild.name + '** — ' + (counts.get(guild.id) ?? 0) + ' active event(s) — id ``' + guild.id + '``');

    await this.replyChunked(interaction, lines.length > 0 ? lines : [this.dictionary.get('/calendar/interaction/adminNoGuilds')]);
  }

  private async showEvents(interaction: Discord.ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: Discord.MessageFlags.Ephemeral });

    const guildId = interaction.options.getString('guild');
    if (!AdminCommand.isSnowflake(guildId)) {
      await interaction.editReply({ content: this.dictionary.get('/calendar/interaction/adminInvalidId') });
      return;
    }

    const events = await EventModel.find({ guildId, active: true }).sort({ eventDate: 1 }).limit(50);
    const lines = events.map((event) => {
      const registrations = event.registrations ? event.registrations.size : 0;
      return ModifyCommand.formatChoiceName(event) + ' — <#' + event.channelId + '> — ' + registrations + ' registered';
    });

    await this.replyChunked(interaction, lines.length > 0 ? lines : [this.dictionary.get('/calendar/interaction/adminNoEvents')]);
  }

  private async confirmLeave(interaction: Discord.ChatInputCommandInteraction) {
    const guildId = interaction.options.getString('guild');
    if (!AdminCommand.isSnowflake(guildId)) {
      await interaction.reply({
        content: this.dictionary.get('/calendar/interaction/adminInvalidId'),
        flags: Discord.MessageFlags.Ephemeral,
      });
      return;
    }

    const guild = interaction.client.guilds.cache.get(guildId);
    const confirmRow = new Discord.ActionRowBuilder<Discord.ButtonBuilder>().addComponents(
      new Discord.ButtonBuilder()
        .setCustomId(ADMIN_BUTTON_NAMESPACE + ':leave:' + guildId)
        .setLabel(this.dictionary.get('/calendar/interaction/adminLeaveConfirmLabel'))
        .setStyle(Discord.ButtonStyle.Danger));

    await interaction.reply({
      content: this.dictionary.get('/calendar/interaction/adminLeaveConfirm')
        .replace('{guild}', guild !== undefined ? guild.name : guildId),
      components: [confirmRow],
      flags: Discord.MessageFlags.Ephemeral,
    });
  }

  private async detach(interaction: Discord.ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: Discord.MessageFlags.Ephemeral });

    const channelId = interaction.options.getString('channel');
    if (!AdminCommand.isSnowflake(channelId)) {
      await interaction.editReply({ content: this.dictionary.get('/calendar/interaction/adminInvalidId') });
      return;
    }

    // Raw ids of dead or foreign channels are allowed on purpose (cleanup)
    const cached: any = interaction.client.channels.cache.get(channelId);
    const outcome = await new AdminActions(interaction.client).detachChannel(channelId, cached?.guildId ?? interaction.guildId);
    Logger.info('Admin action', { action: 'detachChannel', target: channelId, surface: 'discord', outcome: outcome.status });

    const key = outcome.status === 'already'
      ? '/calendar/interaction/adminDetachAlready'
      : '/calendar/interaction/adminDetachDone';
    await interaction.editReply({
      content: this.dictionary.get(key)
        .replace('{count}', String(outcome.deactivated ?? 0))
        .replace('{mirrors}', String(outcome.mirrorsDeleted ?? 0)),
    });
  }

  private async reattach(interaction: Discord.ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: Discord.MessageFlags.Ephemeral });

    const channelId = interaction.options.getString('channel');
    if (!AdminCommand.isSnowflake(channelId)) {
      await interaction.editReply({ content: this.dictionary.get('/calendar/interaction/adminInvalidId') });
      return;
    }

    const outcome = await new AdminActions(interaction.client).reattachChannel(channelId);
    Logger.info('Admin action', { action: 'reattachChannel', target: channelId, surface: 'discord', outcome: outcome.status });

    const key = outcome.status === 'notFound'
      ? '/calendar/interaction/adminReattachNone'
      : '/calendar/interaction/adminReattachDone';
    await interaction.editReply({ content: this.dictionary.get(key).replace('{state}', outcome.priorState ?? '') });
  }

  private leaveOutcomeMessage(outcome: ActionOutcome, guildId: string): string {
    if (outcome.status === 'owned') {
      return this.dictionary.get('/calendar/interaction/adminLeaveOwned');
    }
    const key = outcome.status === 'already'
      ? '/calendar/interaction/adminLeaveAlready'
      : '/calendar/interaction/adminLeaveDone';
    return this.dictionary.get(key)
      .replace('{guild}', guildId)
      .replace('{count}', String(outcome.deactivated ?? 0));
  }

  private describeChannel(client: Discord.Client, channelId: string): string {
    const cached: any = client.channels.cache.get(channelId);
    return cached !== undefined && cached.name ? '#' + cached.name : channelId;
  }

  private async replyChunked(interaction: Discord.ChatInputCommandInteraction, lines: string[]) {
    const chunks = AdminCommand.chunkLines(lines, MAX_CHARS_PER_REPLY, MAX_ROWS_PER_REPLY);
    await interaction.editReply({ content: chunks[0] });
    for (const chunk of chunks.slice(1)) {
      await interaction.followUp({ content: chunk, flags: Discord.MessageFlags.Ephemeral });
    }
  }
}
