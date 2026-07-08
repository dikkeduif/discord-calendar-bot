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
import { SessionManager } from './SessionManager';
import { EventModel } from '../Models/Event';
import EventCreationProgress from '../Enums/EventCreationProgress';
import SessionType from '../Enums/SessionType';

describe('SessionManager', () => {
  const realCreate = (EventModel as any).create;
  let created: any[];

  beforeEach(() => {
    created = [];
    (EventModel as any).create = async (doc: any) => {
      created.push(doc);
      return doc;
    };
  });

  after(() => {
    (EventModel as any).create = realCreate;
  });

  it('creates a session with first-time-user defaults when no user record exists', async () => {
    const manager = new SessionManager();
    const event = await manager.create('author1', 'name', 'chan', 'guild', SessionType.CREATE, null);

    assert.equal(event.status, EventCreationProgress.WaitingForFirstTimeUser);
    assert.equal(event.shortId.length, 6);
    assert.equal(event.active, true);
    assert.ok(manager.hasSession('author1'));
  });

  it('returns null when the user already has a session', async () => {
    const manager = new SessionManager();
    await manager.create('author1', 'name', 'chan', 'guild', SessionType.CREATE, null);
    const second = await manager.create('author1', 'name', 'chan', 'guild', SessionType.CREATE, null);

    assert.equal(second, null);
  });

  it('persists a completed create session exactly once', async () => {
    const manager = new SessionManager();
    const event = await manager.create('author1', 'name', 'chan', 'guild', SessionType.CREATE, null);
    event.status = EventCreationProgress.Done;

    await manager.finishSession('author1');

    assert.equal(created.length, 1);
    assert.equal(created[0].shortId, event.shortId);
    assert.ok(!manager.hasSession('author1'));
  });

  it('discards an exited create session without persisting', async () => {
    const manager = new SessionManager();
    const event = await manager.create('author1', 'name', 'chan', 'guild', SessionType.CREATE, null);
    event.status = EventCreationProgress.Exit;

    await manager.finishSession('author1');

    assert.equal(created.length, 0);
    assert.ok(!manager.hasSession('author1'));
  });

  it('never persists modify sessions, even when marked done', async () => {
    const manager = new SessionManager();
    const event = await manager.create('author1', 'name', 'chan', 'guild', SessionType.MODIFY, null);
    event.status = EventCreationProgress.Done;

    await manager.finishSession('author1');

    assert.equal(created.length, 0);
    assert.ok(!manager.hasSession('author1'));
  });
});
