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
import EmojiValidation from '../Validation/EmojiValidation';

// Buttons cap at 25 per message and embeds at 25 fields; the standard
// decline occupies one slot of each
const MAX_OPTIONS = 24;

// Button label limit
const MAX_LABEL_LENGTH = 80;

export type ParseFailureReason = 'invalidEmoji' | 'missingLabel' | 'labelTooLong' | 'duplicate' | 'declineCollision' | 'tooMany';

// Plain shape rather than a discriminated union: the non-strict compiler
// profile doesn't narrow discriminants, and fighting it buys nothing here
export interface ParseResult {
  ok: boolean;
  options?: Map<string, string>;
  reason?: ParseFailureReason;
  line?: string;
}

/**
 * Parses the modal's options field: one 'emoji label' pair per line,
 * blank input meaning "use the defaults" (the caller applies them).
 */
export default class OptionsFieldParser {
  public static parse(input: string, client: Discord.Client, declineEmoji: string): ParseResult {
    const options = new Map<string, string>();
    const seen = new Set<string>();
    const declineNormalized = OptionsFieldParser.normalizeForComparison(declineEmoji);

    const lines = (input ?? '').split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);

    for (const line of lines) {
      const spaceIndex = line.indexOf(' ');
      const emojiToken = spaceIndex === -1 ? line : line.slice(0, spaceIndex);
      const label = spaceIndex === -1 ? '' : line.slice(spaceIndex + 1).trim();

      if (label.length === 0) {
        return { ok: false, reason: 'missingLabel', line };
      }
      if (label.length > MAX_LABEL_LENGTH) {
        return { ok: false, reason: 'labelTooLong', line };
      }

      const validated = EmojiValidation.isValidEmoji(emojiToken, client);
      if (validated === false) {
        return { ok: false, reason: 'invalidEmoji', line };
      }

      // EmojiValidation returns bare shortcode names for :name: input;
      // buttons need the actual unicode character
      const key = OptionsFieldParser.normalizeKey(validated);

      const comparable = OptionsFieldParser.normalizeForComparison(key);
      if (comparable === declineNormalized) {
        return { ok: false, reason: 'declineCollision', line };
      }
      if (seen.has(comparable)) {
        return { ok: false, reason: 'duplicate', line };
      }
      seen.add(comparable);

      options.set(key, label);

      if (options.size > MAX_OPTIONS) {
        return { ok: false, reason: 'tooMany', line };
      }
    }

    return { ok: true, options };
  }

  private static normalizeKey(validated: string): string {
    if (/^<a?:\w+:\d+>$/.test(validated)) {
      return validated;
    }
    // get() resolves shortcode names to unicode and returns undefined for
    // anything that is already an emoji character
    const fromName = Emoji.get(validated);
    return fromName !== undefined ? fromName : validated;
  }

  /**
   * Duplicate detection treats variation-selector twins (❤ vs ❤️) and
   * NFC/NFD spellings as the same option.
   */
  private static normalizeForComparison(key: string): string {
    return key.normalize('NFC').replace(/️/g, '');
  }
}
