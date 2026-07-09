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

/**
 * In-memory mirror of the ChannelState collection for the hot paths
 * (event creation, reminder ticks) that must not pay a query per check.
 * Valid under the bot's single-process deployment; every mutation goes
 * through AdminActions, which updates this cache alongside the database.
 */
export default class ChannelStateCache {
  private static states = new Map<string, string>();

  public static load(states: Array<{ channelId: string, state: string }>) {
    ChannelStateCache.states = new Map(states.map((entry) => [entry.channelId, entry.state]));
  }

  public static isBlocked(channelId: string): boolean {
    return ChannelStateCache.states.has(channelId);
  }

  public static getState(channelId: string): string | undefined {
    return ChannelStateCache.states.get(channelId);
  }

  public static set(channelId: string, state: string) {
    ChannelStateCache.states.set(channelId, state);
  }

  public static clear(channelId: string) {
    ChannelStateCache.states.delete(channelId);
  }

  public static entries(): Array<{ channelId: string, state: string }> {
    return Array.from(ChannelStateCache.states, ([channelId, state]) => ({ channelId, state }));
  }
}
