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

import { strict as assert } from 'assert';
import { Dictionary } from './Dictionary';
import { CalendarTranslations } from './CalendarTranslations';

describe('Dictionary', () => {
  const dictionary = new Dictionary(CalendarTranslations);

  it('resolves a key through the default language', () => {
    assert.equal(
      dictionary.get('/calendar/creation/eventTitle'),
      'What is the **title** of your event? You can press **!exit** at any time to cancel');
  });

  it('resolves the same string when the language is passed explicitly', () => {
    assert.equal(
      dictionary.get('/calendar/creation/eventTitle', 'en'),
      dictionary.get('/calendar/creation/eventTitle'));
  });

  it('falls back to a missing-translation marker for unknown keys', () => {
    assert.equal(
      dictionary.get('/calendar/creation/doesNotExist'),
      'Translation missing for /calendar/creation/doesNotExist');
  });

  it('falls back for languages that have no translations', () => {
    assert.equal(
      dictionary.get('/calendar/creation/eventTitle', 'fr'),
      'Translation missing for /calendar/creation/eventTitle');
  });

  it('resolves every key the bot sends on its critical paths', () => {
    const criticalKeys = [
      '/calendar/reminder/channelReminder',
      '/calendar/creation/alreadyHaveSession',
      '/calendar/creation/invalidTimeZone',
      '/calendar/creation/firstTimeUser',
      '/calendar/general/sessionEnd',
      '/calendar/modify/summary'
    ];

    for (const key of criticalKeys) {
      assert.ok(
        !dictionary.get(key).startsWith('Translation missing'),
        'expected a translation for ' + key);
    }
  });
});
