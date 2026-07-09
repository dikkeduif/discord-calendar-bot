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
import { classifyDrift } from './Drift';

const event = (shortId: string, guildId: string, channelId: string, scheduledEventId?: string) =>
  ({ shortId, guildId, guildName: 'g-' + guildId, channelId, scheduledEventId });

describe('classifyDrift', () => {
  it('flags guilds with active events that the bot is no longer in', () => {
    const findings = classifyDrift({
      cachedGuildIds: new Set(['g1']),
      activeEvents: [event('a', 'g1', 'c1'), event('b', 'g2', 'c2'), event('c', 'g2', 'c3')],
      channelChecks: new Map(),
      mirrorChecks: new Map(),
      blockedChannelIds: new Set(),
    });

    assert.equal(findings.ghostGuilds.length, 1);
    assert.equal(findings.ghostGuilds[0].guildId, 'g2');
    assert.equal(findings.ghostGuilds[0].activeEvents, 2);
  });

  it('flags only confirmed-dead channels, never errors, never blocked ones', () => {
    const findings = classifyDrift({
      cachedGuildIds: new Set(['g1']),
      activeEvents: [event('a', 'g1', 'dead1'), event('b', 'g1', 'err1'), event('c', 'g1', 'blocked1')],
      channelChecks: new Map([['dead1', 'dead'], ['err1', 'error'], ['blocked1', 'dead']]),
      mirrorChecks: new Map(),
      blockedChannelIds: new Set(['blocked1']),
    });

    assert.equal(findings.deadChannels.length, 1);
    assert.equal(findings.deadChannels[0].channelId, 'dead1');
  });

  it('flags vanished mirrors but not fetch errors or healthy ones', () => {
    const findings = classifyDrift({
      cachedGuildIds: new Set(['g1']),
      activeEvents: [
        event('a', 'g1', 'c1', 'm-gone'),
        event('b', 'g1', 'c1', 'm-ok'),
        event('c', 'g1', 'c1', 'm-err'),
        event('d', 'g1', 'c1'),
      ],
      channelChecks: new Map(),
      mirrorChecks: new Map([['m-gone', 'vanished'], ['m-ok', 'ok'], ['m-err', 'error']]),
      blockedChannelIds: new Set(),
    });

    assert.equal(findings.vanishedMirrors.length, 1);
    assert.equal(findings.vanishedMirrors[0].shortId, 'a');
  });

  it('reports a healthy system as empty findings', () => {
    const findings = classifyDrift({
      cachedGuildIds: new Set(['g1']),
      activeEvents: [event('a', 'g1', 'c1', 'm1')],
      channelChecks: new Map([['c1', 'ok']]),
      mirrorChecks: new Map([['m1', 'ok']]),
      blockedChannelIds: new Set(),
    });

    assert.deepEqual(findings, { ghostGuilds: [], deadChannels: [], vanishedMirrors: [] });
  });
});
