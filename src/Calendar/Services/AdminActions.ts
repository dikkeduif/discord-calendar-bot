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
import { EventModel } from '../Models/Event';
import { ChannelStateModel, ChannelStateKind } from '../Models/ChannelState';
import ChannelStateCache from './ChannelStateCache';
import ScheduledEvent from '../Classes/ScheduledEvent';
import Message from '../Classes/Message';
import Logger from '../../Bot/Logger';

export interface ActorScope {
  // Owner surfaces bypass the author check; Discord user surfaces pass
  // their user id so they can only touch their own events
  ownerBypass: boolean;
  authorId?: string;
}

export interface ActionOutcome {
  status: 'done' | 'already' | 'notFound' | 'owned';
  deactivated?: number;
  mirrorsDeleted?: number;
  priorState?: string;
}

/**
 * The single mutation path for every admin surface (/admin, dashboard,
 * and the user-facing delete). Each method is idempotent: repeating an
 * action reports what already happened instead of failing.
 */
export default class AdminActions {
  private client: Discord.Client;

  constructor(client: Discord.Client) {
    this.client = client;
  }

  public async detachChannel(channelId: string, guildId?: string): Promise<ActionOutcome> {
    const existing = ChannelStateCache.getState(channelId);
    if (existing === ChannelStateKind.detached) {
      return { status: 'already' };
    }

    await ChannelStateModel.findOneAndUpdate(
      { channelId },
      { channelId, guildId, state: ChannelStateKind.detached },
      { upsert: true });
    ChannelStateCache.set(channelId, ChannelStateKind.detached);

    const result = await this.deactivateChannelEvents(channelId);

    Logger.info('Channel detached', { channelId, guildId, ...result });
    return { status: 'done', ...result, priorState: existing };
  }

  public async reattachChannel(channelId: string): Promise<ActionOutcome> {
    const existing = ChannelStateCache.getState(channelId);
    if (existing === undefined) {
      return { status: 'notFound' };
    }

    // Clears quarantine records too: the owner's way of saying "this
    // channel is fine again". Deactivated events stay deactivated —
    // re-attach only lifts the creation block
    await ChannelStateModel.deleteOne({ channelId });
    ChannelStateCache.clear(channelId);

    Logger.info('Channel re-attached', { channelId, priorState: existing });
    return { status: 'done', priorState: existing };
  }

  /**
   * The reminder loop's dead-channel path routes through here so
   * quarantines get a queryable record and mirror cleanup — previously
   * they only flipped active flags and orphaned the Events-tab entries.
   */
  public async quarantineChannel(channelId: string, guildId?: string): Promise<ActionOutcome> {
    if (ChannelStateCache.isBlocked(channelId)) {
      return { status: 'already' };
    }

    await ChannelStateModel.findOneAndUpdate(
      { channelId },
      { channelId, guildId, state: ChannelStateKind.quarantined },
      { upsert: true });
    ChannelStateCache.set(channelId, ChannelStateKind.quarantined);

    const result = await this.deactivateChannelEvents(channelId);
    return { status: 'done', ...result };
  }

  public async deleteEvent(shortId: string, scope: ActorScope): Promise<ActionOutcome> {
    const filter: any = { shortId, active: true };
    if (!scope.ownerBypass) {
      filter.authorId = scope.authorId;
    }

    const event = await EventModel.findOne(filter);
    if (event === null) {
      return { status: 'notFound' };
    }

    await EventModel.findOneAndUpdate({ shortId }, { active: false });
    await new Message(this.client, event.messageId).delete(event);

    Logger.info('Event deleted', { shortId, ownerBypass: scope.ownerBypass });
    return { status: 'done' };
  }

  /**
   * Leaves a guild without leaving ghosts: native mirrors are deleted
   * first (they persist after the creator departs, and the bot loses
   * access the moment it leaves), then the guild's events deactivate,
   * then the actual leave. Idempotent: a guild that is already gone
   * still gets its local cleanup.
   */
  public async leaveGuild(guildId: string): Promise<ActionOutcome> {
    const guild = this.client.guilds.cache.get(guildId);
    const events = await EventModel.find({ guildId, active: true });

    let mirrorsDeleted = 0;
    if (guild !== undefined) {
      for (const event of events) {
        if (event.scheduledEventId) {
          await new ScheduledEvent().delete(event, guild);
          mirrorsDeleted++;
        }
      }
    }

    await EventModel.updateMany({ guildId, active: true }, { active: false });

    if (guild === undefined) {
      Logger.info('Guild already gone, cleaned up locally', { guildId, deactivated: events.length });
      return { status: 'already', deactivated: events.length, mirrorsDeleted };
    }

    try {
      await guild.leave();
    } catch (err) {
      if (err.code === Discord.RESTJSONErrorCodes.UnknownGuild) {
        return { status: 'already', deactivated: events.length, mirrorsDeleted };
      }
      if (err.code === Discord.DiscordjsErrorCodes.GuildOwned) {
        return { status: 'owned', deactivated: events.length, mirrorsDeleted };
      }
      throw err;
    }

    Logger.info('Left guild', { guildId, deactivated: events.length, mirrorsDeleted });
    return { status: 'done', deactivated: events.length, mirrorsDeleted };
  }

  /**
   * Drops a stale scheduledEventId (the native event vanished from
   * Discord's side) so the mirror stops drifting.
   */
  public async clearMirror(shortId: string): Promise<ActionOutcome> {
    const updated = await EventModel.findOneAndUpdate(
      { shortId, scheduledEventId: { $exists: true } },
      { $unset: { scheduledEventId: 1 } });
    return { status: updated !== null ? 'done' : 'notFound' };
  }

  /**
   * Shared by detach and quarantine: flip the channel's active events
   * off and best-effort delete their native mirrors. One failing mirror
   * never aborts the loop.
   */
  private async deactivateChannelEvents(channelId: string): Promise<{ deactivated: number, mirrorsDeleted: number }> {
    const events = await EventModel.find({ channelId, active: true });

    await EventModel.updateMany({ channelId, active: true }, { active: false });

    let mirrorsDeleted = 0;
    for (const event of events) {
      if (!event.scheduledEventId || !event.guildId) {
        continue;
      }
      const guild = this.client.guilds.cache.get(event.guildId);
      if (guild === undefined) {
        continue;
      }
      await new ScheduledEvent().delete(event, guild);
      mirrorsDeleted++;
    }

    return { deactivated: events.length, mirrorsDeleted };
  }
}
