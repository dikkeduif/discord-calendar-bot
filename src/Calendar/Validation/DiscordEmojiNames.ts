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

import * as DiscordEmoji from 'discord-emoji';

/**
 * Discord's picker teaches users shortcode names (:french_bread:) that
 * node-emoji's dictionary doesn't always share (baguette_bread), so
 * validation needs Discord's own tables as a fallback.
 */
const byName = new Map<string, string>();
for (const category of [
  DiscordEmoji.activity, DiscordEmoji.flags, DiscordEmoji.food,
  DiscordEmoji.nature, DiscordEmoji.objects, DiscordEmoji.people,
  DiscordEmoji.symbols, DiscordEmoji.travel,
]) {
  for (const [name, emoji] of Object.entries(category)) {
    byName.set(name, emoji);
  }
}

export default class DiscordEmojiNames {
  /**
   * Resolves a Discord shortcode name to its unicode character. The
   * picker is case-insensitive, so the lookup is too.
   */
  public static resolve(name: string): string | undefined {
    return byName.get(name.toLowerCase());
  }
}
