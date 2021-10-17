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
import Emoji from 'node-emoji';

export default class EmojiValidation {
  static isValidEmoji(emojiStr: string, client: Discord.Client) {
    const cleanedEmoji = emojiStr.replace(/:/g, '');
    const emoji = client.emojis.cache.find(emo => emo.name === cleanedEmoji);

    if (emoji !== undefined) {
      return emoji.toString();
    } else {
      if (Emoji.hasEmoji(cleanedEmoji)) {
        return cleanedEmoji;
      } else {
        return false;
      }
    }
  }

  static emojiPartOfList(emojiStr, list) {
    if (list !== undefined) {
      for (const [key, value] of list) {
        if (key === emojiStr) {
          return true;
        }
      }
    }

    return false;
  }
}