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

import { Event, EventModel } from '../Models/Event';
import { User } from '../Models/User';
import Settings from '../../settings';
import EventCreationProgress from '../Enums/EventCreationProgress';
import { customAlphabet } from 'nanoid';

export class SessionManager {

  // string is the authorId
  private sessions: Map<string, Event>;
  private nanoid: any;

  constructor() {
    this.sessions = new Map<string, Event>();
    this.nanoid = customAlphabet('1234567890abcdefghijklmnopqrstuvwxyz', 6);
  }

  public async create(authorId: string, username: string, channelId: string, guildId: string, sessionType: string, user: User) {
    const session = this.getSession(authorId);

    if (session === undefined) {
      const event = new Event();

      event.sessionType = sessionType;
      event.status = user === null ? EventCreationProgress.WaitingForFirstTimeUser : EventCreationProgress.WaitingForTitle;
      event.channelId = channelId;
      event.authorId = authorId;
      event.guildId = guildId;
      event.authorName = username;
      event.active = true;
      event.shortId = await this.nanoid();
      event.userTimeZone = user !== null ? user.userTimeZone : Settings.get('/defaultTimeZone');
      event.eventTimeZone = user !== null ? user.eventTimeZone : Settings.get('/defaultTimeZone');

      this.sessions.set(authorId, event);
      return event;
    }

    return null;
  }

  public setSession(userId, event) {
    this.sessions.set(userId, event);
  }

  public async finishSession(userId) {
    const session = this.getSession(userId);

    if (session !== undefined && session !== null) {
      await EventModel.create(session);
      this.sessions.delete(userId);
    }
  }

  public getSession(userId): Event {
    const session = this.sessions.get(userId);
    return session;
  }

  public hasSession(userId): boolean {
    const session = this.getSession(userId);

    if (session !== undefined && session !== null) {
      return true;
    }

    return false;
  }
}