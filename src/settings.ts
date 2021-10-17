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

import * as Confidence from 'confidence';

const settings = {
  defaultLanguage: 'en',
  defaultTimeZone: 'Europe/London',
  sessionTimeout: 600,
  environment: process.env.NODE_ENV,
  discord: {
    token: process.env.DISCORD_TOKEN
  },
  databases: {
    mongoose: {
      connection: process.env.MONGODB_CONNECTION_STRING
    },
  },
};

class Settings {
  private store: Confidence;

  constructor() {
    this.store = new Confidence.Store();
    this.store.load(settings);
  }

  public get(val: string): string {
    return this.store.get(val);
  }
}
const set = new Settings();
export default set;
