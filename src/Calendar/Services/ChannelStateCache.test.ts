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
import ChannelStateCache from './ChannelStateCache';

describe('ChannelStateCache', () => {
  beforeEach(() => {
    ChannelStateCache.load([]);
  });

  it('reports channels from the loaded snapshot as blocked', () => {
    ChannelStateCache.load([
      { channelId: '111', state: 'detached' },
      { channelId: '222', state: 'quarantined' },
    ]);

    assert.equal(ChannelStateCache.isBlocked('111'), true);
    assert.equal(ChannelStateCache.isBlocked('222'), true);
    assert.equal(ChannelStateCache.isBlocked('333'), false);
    assert.equal(ChannelStateCache.getState('111'), 'detached');
    assert.equal(ChannelStateCache.getState('222'), 'quarantined');
  });

  it('reflects mutations immediately', () => {
    ChannelStateCache.set('444', 'detached');
    assert.equal(ChannelStateCache.isBlocked('444'), true);

    ChannelStateCache.clear('444');
    assert.equal(ChannelStateCache.isBlocked('444'), false);
    assert.equal(ChannelStateCache.getState('444'), undefined);
  });

  it('replaces the whole snapshot on load', () => {
    ChannelStateCache.set('555', 'detached');
    ChannelStateCache.load([{ channelId: '666', state: 'detached' }]);

    assert.equal(ChannelStateCache.isBlocked('555'), false);
    assert.equal(ChannelStateCache.isBlocked('666'), true);
  });

  it('upgrades state in place', () => {
    ChannelStateCache.set('777', 'quarantined');
    ChannelStateCache.set('777', 'detached');

    assert.equal(ChannelStateCache.getState('777'), 'detached');
  });
});
