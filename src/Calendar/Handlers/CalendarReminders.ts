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
import moment_tz from 'moment-timezone';
import Logger from '../../Bot/Logger';

export class CalendarReminders {

  private client: Discord.Client;
  private minutes: number = 30;

  constructor(client: Discord.Client) {
    this.client = client;
  }

  public async eventsReminder() {
    setInterval(() => {
      this.getEventsForReminder();
    }, 10000)
  }

  private async getEventsForReminder() {
    const events = await EventModel.getForReminders();

    for (const index of Object.keys(events)) {
      const event:any = events[index];

      await this.sendReminder(event);
    }
  }

  private async sendReminder(event: Event) {
    const channel: any = await this.client.channels.fetch(event.channelId);

    const userIds = [];
    if (channel.type === 'text' && event.reminder && !event.reminderSent) {

      const moment = moment_tz(new Date()).tz(event.eventTimeZone).format('DD-MM-yyyy HH:mm');

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
          const dictionary = new Dictionary(CalendarTranslations);
          let reminderMsg = dictionary.get('/calendar/reminder/channelReminder');

          reminderMsg = reminderMsg.replace('{userIds}', userIds.join);
          reminderMsg = reminderMsg.replace('{title}', event.title);
          reminderMsg = reminderMsg.replace('{minutes}', event.reminder.toString());
          reminderMsg = reminderMsg.replace('{date}', time);

          channel.send(reminderMsg);
          Logger.info('A reminder was sent for event ' + event.shortId, { shortId: event.shortId, title: event.title });
        }

        await EventModel.findOneAndUpdate({shortId: event.shortId},{ reminderSent: true })
      }
    }
  }

  private sendMessage(user: Discord.User, event: any, message: Discord.Message) {
    const dictionary = new Dictionary(CalendarTranslations);

    let msg = dictionary.get('/calendar/reminder/remind');
    msg = msg.replace('{username}', user.username);
    msg = msg.replace('{title}', event.title);
    msg = msg.replace('{minutes}', this.minutes.toString());

    const embeds = message.embeds[0];

    user.send(msg, {
      embed: embeds
    })
  }
}