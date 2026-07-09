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
import { Event } from '../Models/Event';
import Logger from '../../Bot/Logger';

/**
 * Renders the registration columns of an event embed. Shared by the
 * legacy reaction path and the button path so both surfaces produce
 * identical embeds during the coexistence window.
 */
export default class RegistrationRenderer {
  /**
   * Pure column builder: one inline field per option, in options order.
   * Name shape ('label (emoji) \n') is legacy-exact — changing it would
   * visibly rewrite every live event embed on the next registration.
   */
  public static buildFields(options: Map<string, string>, nicknamesByOption: Map<string, string[]>): Discord.APIEmbedField[] {
    const fields: Discord.APIEmbedField[] = [];

    for (const [key, label] of options) {
      // Embed hard limits — EmbedBuilder validates eagerly and would
      // throw. The slash parser prevents both, but legacy-interview
      // events carry unbounded labels and option counts
      if (fields.length === 25) {
        break;
      }
      const name = (label + ' (' + key + ') ' + '\n').slice(0, 256);

      const nicknames = nicknamesByOption.get(key);
      if (nicknames !== undefined && nicknames.length !== 0) {
        fields.push({ name, value: '>>> ' + nicknames.join('\n'), inline: true });
      } else {
        fields.push({ name, value: '-', inline: true });
      }
    }

    return fields;
  }

  /**
   * Resolves registrations (userId → option key) into per-option nickname
   * lists, preserving the hardened guards: cache-first user lookup, fetch
   * fallback, skip-unresolvable, guild nickname preferred over username.
   */
  public static async resolveNicknames(
    client: Discord.Client,
    guild: Discord.Guild | null,
    event: Event): Promise<Map<string, string[]>> {

    const nicknamesByOption = new Map<string, string[]>();

    if (!event.registrations) {
      return nicknamesByOption;
    }

    for (const [userId, optionKey] of event.registrations) {
      // A stale registration must not break the rebuild for everyone else
      if (!event.options || !event.options.has(optionKey)) {
        continue;
      }

      let registeredUser = client.users.cache.get(userId);

      try {
        if (registeredUser === undefined) {
          registeredUser = await client.users.fetch(userId);
        }

        if (registeredUser.partial) {
          await registeredUser.fetch();
        }
      } catch (exception) {
        // A deleted account must not block the embed rebuild for everyone else
        Logger.error('Skipping unresolvable registered user ' + userId + ': ' + exception.message);
        continue;
      }

      let guildMember = null;
      if (guild !== null) {
        guildMember = guild.members.cache.get(registeredUser.id) ?? null;
        if (guildMember === null) {
          try {
            guildMember = await guild.members.fetch(registeredUser);
          } catch (exception) {
            guildMember = null;
            Logger.error(exception);
          }
        }
      }

      let nickname: string;
      if (guildMember === null || guildMember.nickname === null || guildMember.nickname.length === 0) {
        nickname = registeredUser.username;
      } else {
        nickname = guildMember.nickname;
      }

      if (!nicknamesByOption.has(optionKey)) {
        nicknamesByOption.set(optionKey, []);
      }
      nicknamesByOption.get(optionKey).push(nickname);
    }

    return nicknamesByOption;
  }

  public static async renderFields(client: Discord.Client, guild: Discord.Guild | null, event: Event): Promise<Discord.APIEmbedField[]> {
    const nicknames = await RegistrationRenderer.resolveNicknames(client, guild, event);
    return RegistrationRenderer.buildFields(event.options, nicknames);
  }
}
