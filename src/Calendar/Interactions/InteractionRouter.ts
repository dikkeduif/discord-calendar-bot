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
import CreateCommand, { CREATE_MODAL_ID, CREATE_RETRY_ID } from './CreateCommand';
import ModifyCommand, { MODIFY_MODAL_NAMESPACE } from './ModifyCommand';
import DeleteCommand, { DELETE_CONFIRM_NAMESPACE } from './DeleteCommand';
import TimezoneCommand from './TimezoneCommand';
import AdminCommand, { ADMIN_BUTTON_NAMESPACE } from './AdminCommand';
import Settings from '../../settings';

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
  private createCommand: CreateCommand;
  private modifyCommand: ModifyCommand;
  private deleteCommand: DeleteCommand;
  private timezoneCommand: TimezoneCommand;
  private adminCommand: AdminCommand;

  constructor(client: Discord.Client) {
    this.client = client;
    this.dictionary = new Dictionary(CalendarTranslations);
    this.helpCommand = new HelpCommand();
    this.registrationButtons = new RegistrationButtonHandler();
    this.createCommand = new CreateCommand();
    this.modifyCommand = new ModifyCommand();
    this.deleteCommand = new DeleteCommand();
    this.timezoneCommand = new TimezoneCommand();
    this.adminCommand = new AdminCommand();
  }

  // The gate for every /admin dispatch path — execute, autocomplete, and
  // buttons all arrive independently, and autocomplete would leak guild
  // names to anyone typing if left unguarded
  private isOwner(userId: string): boolean {
    return AdminCommand.isOwner(userId, Settings.get('/discord/ownerId'));
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

    if (interaction.commandName === 'event') {
      const subcommand = interaction.options.getSubcommand();
      if (subcommand === 'create') {
        await this.createCommand.execute(interaction);
        return;
      }
      if (subcommand === 'modify') {
        await this.modifyCommand.execute(interaction);
        return;
      }
      if (subcommand === 'delete') {
        await this.deleteCommand.execute(interaction);
        return;
      }
    }

    if (interaction.commandName === 'timezone' && interaction.options.getSubcommand() === 'set') {
      await this.timezoneCommand.execute(interaction);
      return;
    }

    if (interaction.commandName === 'admin') {
      if (!this.isOwner(interaction.user.id)) {
        await interaction.reply({
          content: this.dictionary.get('/calendar/interaction/adminNotOwner'),
          flags: Discord.MessageFlags.Ephemeral,
        });
        return;
      }
      await this.adminCommand.execute(interaction);
      return;
    }

    Logger.debug('Unrouted chat command: ' + interaction.commandName);
    await this.replyWithError(interaction);
  }

  private async routeAutocomplete(interaction: Discord.AutocompleteInteraction) {
    // Autocomplete cannot show errors and cannot be deferred: whatever
    // happens, answer inside the 3-second window — empty on failure
    try {
      if (interaction.commandName === 'event') {
        await this.modifyCommand.autocomplete(interaction);
        return;
      }
      if (interaction.commandName === 'timezone') {
        await this.timezoneCommand.autocomplete(interaction);
        return;
      }
      if (interaction.commandName === 'admin' && this.isOwner(interaction.user.id)) {
        await this.adminCommand.autocomplete(interaction);
        return;
      }
      await interaction.respond([]);
    } catch (err) {
      Logger.error('Autocomplete failed: ' + err.message);
    }
  }

  private async routeModalSubmit(interaction: Discord.ModalSubmitInteraction) {
    if (interaction.customId === CREATE_MODAL_ID) {
      await this.createCommand.handleModalSubmit(interaction);
      return;
    }

    if (InteractionRouter.matchNamespace(interaction.customId) === MODIFY_MODAL_NAMESPACE) {
      await this.modifyCommand.handleModalSubmit(interaction);
      return;
    }

    Logger.debug('Unrouted modal submit: ' + interaction.customId);
  }

  private async routeButton(interaction: Discord.ButtonInteraction) {
    const namespace = InteractionRouter.matchNamespace(interaction.customId);

    if (namespace === 'ev:reg') {
      await this.registrationButtons.execute(interaction);
      return;
    }

    if (interaction.customId === CREATE_RETRY_ID) {
      await this.createCommand.handleRetry(interaction);
      return;
    }

    if (namespace === DELETE_CONFIRM_NAMESPACE) {
      await this.deleteCommand.handleConfirm(interaction);
      return;
    }

    if (namespace === ADMIN_BUTTON_NAMESPACE) {
      if (!this.isOwner(interaction.user.id)) {
        await interaction.reply({
          content: this.dictionary.get('/calendar/interaction/adminNotOwner'),
          flags: Discord.MessageFlags.Ephemeral,
        });
        return;
      }
      await this.adminCommand.handleButton(interaction);
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
