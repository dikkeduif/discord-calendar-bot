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
import { EventModel } from '../Calendar/Models/Event';
import ChannelStateCache from '../Calendar/Services/ChannelStateCache';
import Logger from '../Bot/Logger';

const CHANNEL_CHECK_BATCH = 3;

export interface DriftEvent {
  shortId: string;
  guildId: string;
  guildName?: string;
  channelId: string;
  scheduledEventId?: string;
}

export interface DriftFindings {
  ghostGuilds: Array<{ guildId: string, guildName: string, activeEvents: number }>;
  deadChannels: Array<{ channelId: string, guildId: string, events: number }>;
  vanishedMirrors: Array<{ shortId: string, scheduledEventId: string, guildId: string }>;
}

/**
 * Pure classifier over pre-gathered facts, so the categorization rules
 * are testable without Discord: only confirmed signals count — a fetch
 * error is never treated as "gone", and deliberately blocked channels
 * are the owner's business, not drift.
 */
export function classifyDrift(input: {
  cachedGuildIds: Set<string>,
  activeEvents: DriftEvent[],
  channelChecks: Map<string, string>,
  mirrorChecks: Map<string, string>,
  blockedChannelIds: Set<string>,
}): DriftFindings {
  const ghostsById = new Map<string, { guildId: string, guildName: string, activeEvents: number }>();
  const deadById = new Map<string, { channelId: string, guildId: string, events: number }>();
  const vanishedMirrors: DriftFindings['vanishedMirrors'] = [];

  for (const event of input.activeEvents) {
    if (event.guildId && !input.cachedGuildIds.has(event.guildId)) {
      const ghost = ghostsById.get(event.guildId) ?? { guildId: event.guildId, guildName: event.guildName ?? 'unknown', activeEvents: 0 };
      ghost.activeEvents++;
      ghostsById.set(event.guildId, ghost);
    }

    if (input.channelChecks.get(event.channelId) === 'dead' && !input.blockedChannelIds.has(event.channelId)) {
      const dead = deadById.get(event.channelId) ?? { channelId: event.channelId, guildId: event.guildId, events: 0 };
      dead.events++;
      deadById.set(event.channelId, dead);
    }

    if (event.scheduledEventId && input.mirrorChecks.get(event.scheduledEventId) === 'vanished') {
      vanishedMirrors.push({ shortId: event.shortId, scheduledEventId: event.scheduledEventId, guildId: event.guildId });
    }
  }

  return {
    ghostGuilds: Array.from(ghostsById.values()),
    deadChannels: Array.from(deadById.values()),
    vanishedMirrors,
  };
}

/**
 * Gathers the facts the classifier needs. On-demand only, and refused
 * when the client isn't ready — a cold cache would classify every
 * guild as ghost and hand the owner a destructive cleanup list.
 */
export async function runDriftScan(client: Discord.Client): Promise<DriftFindings> {
  if (!client.isReady()) {
    throw new Error('Client is not ready — a partial cache would produce false ghosts');
  }

  const activeEvents: DriftEvent[] = await EventModel.find({ active: true });
  const cachedGuildIds = new Set(client.guilds.cache.keys());
  const blockedChannelIds = new Set(ChannelStateCache.entries().map((entry) => entry.channelId));

  // Channel existence: one fetch per distinct channel, small batches,
  // only for guilds the bot is still in (ghost cleanup covers the rest)
  const channelChecks = new Map<string, string>();
  const channelIds = Array.from(new Set(
    activeEvents
      .filter((event) => cachedGuildIds.has(event.guildId) && !blockedChannelIds.has(event.channelId))
      .map((event) => event.channelId)));

  for (let i = 0; i < channelIds.length; i += CHANNEL_CHECK_BATCH) {
    const batch = channelIds.slice(i, i + CHANNEL_CHECK_BATCH);
    await Promise.all(batch.map(async (channelId) => {
      try {
        await client.channels.fetch(channelId);
        channelChecks.set(channelId, 'ok');
      } catch (err) {
        // Only Unknown Channel is death; Missing Access and transport
        // errors must not feed a cleanup list
        const dead = err instanceof Discord.DiscordAPIError && err.code === Discord.RESTJSONErrorCodes.UnknownChannel;
        channelChecks.set(channelId, dead ? 'dead' : 'error');
      }
    }));
  }

  // Mirror existence: one fetch-all per guild (the single-id fetch
  // would answer from cache and lie about deleted events)
  const mirrorChecks = new Map<string, string>();
  const guildIdsWithMirrors = Array.from(new Set(
    activeEvents
      .filter((event) => event.scheduledEventId && cachedGuildIds.has(event.guildId))
      .map((event) => event.guildId)));

  for (const guildId of guildIdsWithMirrors) {
    const guild = client.guilds.cache.get(guildId);
    const mirrors = activeEvents.filter((event) => event.guildId === guildId && event.scheduledEventId);
    try {
      const existing = await guild.scheduledEvents.fetch();
      for (const event of mirrors) {
        mirrorChecks.set(event.scheduledEventId, existing.has(event.scheduledEventId as any) ? 'ok' : 'vanished');
      }
    } catch (err) {
      Logger.error('Drift: could not list scheduled events for guild ' + guildId + ': ' + err.message);
      for (const event of mirrors) {
        mirrorChecks.set(event.scheduledEventId, 'error');
      }
    }
  }

  return classifyDrift({ cachedGuildIds, activeEvents, channelChecks, mirrorChecks, blockedChannelIds });
}
