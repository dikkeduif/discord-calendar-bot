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

import Settings from '../settings';
import * as Confidence from 'confidence';

export class Dictionary {
  private store: Confidence;

  constructor(translations: any) {
    this.store = new Confidence.Store();
    this.store.load(translations);
  }

  public get(val: string, language?: string): string {
    if (language === undefined) {
      language = Settings.get('/defaultLanguage').toLowerCase();
    }

    let translation = this.store.get(val, { lang: language });

    if (translation === undefined) {
      translation = 'Translation missing for ' + val;
    }

    return translation;
  }
}