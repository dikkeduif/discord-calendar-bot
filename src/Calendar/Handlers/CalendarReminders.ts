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
import { Dictionary, CalendarTranslations } from '../../Dictionaries';
import { Event, EventModel } from '../Models/Event';
import AdminActions from '../Services/AdminActions';
import ChannelStateCache from '../Services/ChannelStateCache';
import moment_tz from 'moment-timezone';
import Logger from '../../Bot/Logger';

export class CalendarReminders {

  public static formatChannelReminder(event: Event, userIds: string[], time: string): string {
    const dictionary = new Dictionary(CalendarTranslations);
    let reminderMsg = dictionary.get('/calendar/reminder/channelReminder');

    reminderMsg = reminderMsg.replace('{userIds}', userIds.join(' '));
    reminderMsg = reminderMsg.replace('{title}', event.title);
    reminderMsg = reminderMsg.replace('{minutes}', event.reminder.toString());
    reminderMsg = reminderMsg.replace('{date}', time);

    return reminderMsg;
  }

  private client: Discord.Client;

  constructor(client: Discord.Client) {
    this.client = client;
  }

  public eventsReminder() {
    this.scheduleNextTick();
  }

  private scheduleNextTick() {
    // Self-rescheduling: a slow tick can never overlap the next one
    setTimeout(() => {
      this.getEventsForReminder()
        .catch((err) => {
          Logger.error('Reminder tick failed: ' + err.message);
        })
        .finally(() => {
          this.scheduleNextTick();
        });
    }, 10000);
  }

  private async getEventsForReminder() {
    const events = await EventModel.getForReminders();
    const deadChannels = new Set<string>();

    for (const index of Object.keys(events)) {
      const event: any = events[index];

      if (deadChannels.has(event.channelId)) {
        continue;
      }

      try {
        await this.sendReminder(event);
      } catch (err) {
        // One failing event must not block the rest of the batch
        Logger.error('Reminder failed for event ' + event.shortId + ': ' + err.message, { shortId: event.shortId });

        // The channel is gone for good: quarantine it — records the state,
        // retires every event that points at it, and cleans their native
        // mirrors (which used to linger in the Events tab)
        if (err instanceof Discord.DiscordAPIError && err.code === Discord.RESTJSONErrorCodes.UnknownChannel) {
          deadChannels.add(event.channelId);
          const outcome = await new AdminActions(this.client).quarantineChannel(event.channelId, event.guildId);
          Logger.info('Channel ' + event.channelId + ' no longer exists, deactivated '
            + (outcome.deactivated ?? 0) + ' event(s)', { channelId: event.channelId });
        }
      }
    }
  }

  private async sendReminder(event: Event) {
    // Race safety net: detached events are already inactive, but a tick
    // loaded before the detach landed must not ping the channel. Heal
    // the blocked-but-active state (a detach whose deactivation failed
    // mid-way) so such events cannot occupy the batch window forever
    if (ChannelStateCache.isBlocked(event.channelId)) {
      await EventModel.updateMany({ channelId: event.channelId, active: true }, { active: false });
      return;
    }

    const channel = await this.client.channels.fetch(event.channelId);

    const userIds = [];
    if (channel && channel.type === Discord.ChannelType.GuildText && event.reminder && !event.reminderSent) {

      if (event.eventDate.getTime() / 1000 - moment_tz().unix() < event.reminder * 60) {
        const regs = event.registrations;
        if (regs) {
          for (const [userId, option] of regs) {
            if (option !== event.declineOption) {
              userIds.push('<@!' + userId + '>');
            }
          }
        }

        if (userIds.length > 0) {
          const time = moment_tz(event.eventDate).tz(event.eventTimeZone).format('dddd, MMMM Do YYYY, HH:mm z');
          const reminderMsg = CalendarReminders.formatChannelReminder(event, userIds, time);

          // Only mark the reminder sent once the send actually succeeded
          await channel.send(reminderMsg);
          Logger.info('A reminder was sent for event ' + event.shortId, { shortId: event.shortId, title: event.title });
        }

        await EventModel.findOneAndUpdate({shortId: event.shortId},{ reminderSent: true })
      }
    }
  }
}