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
import Logger from '../../Bot/Logger';
import { Dictionary, CalendarTranslations } from '../../Dictionaries';
import { buildCommandDefinitions } from './CommandDefinitions';
import HelpCommand from './HelpCommand';
import RegistrationButtonHandler from './RegistrationButtonHandler';

export default class InteractionRouter {
  /**
   * customIds are namespaced 'ev:<kind>:...'; routing happens on the
   * first two segments so payload segments (which may contain anything
   * except our delimiter positions) never influence dispatch.
   */
  public static matchNamespace(customId: string): string {
    const parts = customId.split(':');
    if (parts.length < 2 || parts[0] !== 'ev') {
      return '';
    }
    return parts[0] + ':' + parts[1];
  }

  private client: Discord.Client;
  private dictionary: Dictionary;
  private helpCommand: HelpCommand;
  private registrationButtons: RegistrationButtonHandler;

  constructor(client: Discord.Client) {
    this.client = client;
    this.dictionary = new Dictionary(CalendarTranslations);
    this.helpCommand = new HelpCommand();
    this.registrationButtons = new RegistrationButtonHandler();
  }

  /**
   * Bulk-overwrites the global command set, but only when the definitions
   * drifted from what Discord already has: a crash-looping process must
   * not burn the 200-creates-per-day command limit.
   */
  public async registerCommands() {
    const definitions = buildCommandDefinitions();
    const existing = await this.client.application.commands.fetch();

    // equals() handles raw snake_case command bodies at runtime (it reads
    // both shapes, contexts included); the overload types just don't admit
    // the REST payload, hence the cast
    const inSync = existing.size === definitions.length
      && definitions.every((definition) =>
        existing.some((command) => command.equals(definition as unknown as Discord.ApplicationCommandData)));

    if (inSync) {
      Logger.info('Slash commands unchanged, skipping registration');
      return;
    }

    await this.client.application.commands.set(definitions);
    Logger.info('Registered ' + definitions.length + ' slash command(s)');
  }

  public async route(interaction: Discord.Interaction) {
    try {
      if (interaction.isChatInputCommand()) {
        await this.routeChatCommand(interaction);
      } else if (interaction.isAutocomplete()) {
        await this.routeAutocomplete(interaction);
      } else if (interaction.isModalSubmit()) {
        await this.routeModalSubmit(interaction);
      } else if (interaction.isButton()) {
        await this.routeButton(interaction);
      }
    } catch (err) {
      Logger.error('Interaction handler failed', { stack: err.stack });
      await this.replyWithError(interaction);
    }
  }

  private async routeChatCommand(interaction: Discord.ChatInputCommandInteraction) {
    if (interaction.commandName === 'help') {
      await this.helpCommand.execute(interaction);
      return;
    }

    // The event and timezone handlers join in later units of this release
    await this.replyWithError(interaction);
  }

  private async routeAutocomplete(interaction: Discord.AutocompleteInteraction) {
    // Autocomplete cannot show errors and cannot be deferred: whatever
    // happens, answer inside the 3-second window — empty on failure
    try {
      await interaction.respond([]);
    } catch (err) {
      Logger.error('Autocomplete failed: ' + err.message);
    }
  }

  private async routeModalSubmit(interaction: Discord.ModalSubmitInteraction) {
    const namespace = InteractionRouter.matchNamespace(interaction.customId);
    Logger.debug('Unrouted modal submit: ' + namespace);
  }

  private async routeButton(interaction: Discord.ButtonInteraction) {
    const namespace = InteractionRouter.matchNamespace(interaction.customId);

    if (namespace === 'ev:reg') {
      await this.registrationButtons.execute(interaction);
      return;
    }

    // Unknown namespaces are ignored quietly: buttons from older bot
    // versions may live on messages forever
    Logger.debug('Unrouted button: ' + namespace);
  }

  private async replyWithError(interaction: Discord.Interaction) {
    if (!interaction.isRepliable()) {
      return;
    }

    const payload: Discord.InteractionReplyOptions = {
      content: this.dictionary.get('/calendar/interaction/error'),
      flags: Discord.MessageFlags.Ephemeral,
    };

    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(payload);
      } else {
        await interaction.reply(payload);
      }
    } catch (err) {
      // Dead token (expired or 10062): nothing can reach the user anymore
      Logger.error('Could not deliver interaction error reply: ' + err.message);
    }
  }
}
