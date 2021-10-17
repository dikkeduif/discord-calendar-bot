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
import AbstractHandler from './AbstractHandler';
import { Event, EventModel } from '../Models/Event';
import SessionType from '../Enums/SessionType';
import moment from 'moment-timezone';
import EventCreationProgress from '../Enums/EventCreationProgress';
import DateValidation from '../Validation/DateValidation';
import { SessionManager } from '../Classes/SessionManager';
import Message from '../Classes/Message';
import validator from 'validator';
import isNumeric = validator.isNumeric;

class ModifyHandler extends AbstractHandler {
  private client: Discord.Client

  public constructor(client: Discord.Client) {
    super('!modify', ['dm'], SessionType.MODIFY)
    this.client = client;
  }

  private async getPreviousEvents(event: any) {
    const events = await EventModel.getUserEvents(event.authorId);

    let msg = this.dictionary.get('/calendar/modify/summary');
    msg = msg.replace('{amount}', events.length.toString());

    let eventsStr = '';
    for (const obj of Object.keys(events)) {
      const ev: Event = events[obj];
      eventsStr += 'ID [ **' + ev.shortId + '** ] : ' + ev.title + ' - (' + moment(ev.eventDate).tz(ev.eventTimeZone).format( 'DD-MM-yyyy HH:mm') + ')\n';
    }
    msg = msg.replace('{events}', eventsStr);
    return msg;
  }

  public async processMessage(message: Discord.Message, event: Event, sessionManager: SessionManager): Promise<number> {
    if (event.sessionType === SessionType.MODIFY) {
      const userInput = message.content.toString();
      const parts = userInput.split(/\s+/g);

      let msg = ''

      if (userInput === '!exit') {
        event.status = EventCreationProgress.Done;
        msg = this.dictionary.get('/calendar/modify/exiting');
        await message.author.send(msg);
        return event.status;
      }

      if (parts.length === 1 && parts[0] === '!modify') {
        msg = await this.getPreviousEvents(event)
        await message.author.send(msg);

        return EventCreationProgress.Exit;
      } else {
        if (parts[0] === '!modify' && parts[1] !== undefined && parts[2] !== undefined) {
          console.log('Checking session...');
          const id = parts[1];
          const option = parts[2];

          const ev = await EventModel.getByShortId(id, message.author.id);
          if (ev) {
            event = ev;
            event.sessionType = 'modify';

            switch (option) {
              case 'time':
                event.status = EventCreationProgress.WaitingForTime;
                break;
              case 'title':
                event.status = EventCreationProgress.WaitingForTitle;
                break;
              case 'description':
                event.status = EventCreationProgress.WaitingForDescription;
                break;
              case 'delete':
                event.status = EventCreationProgress.WaitingForDelete;
                break;
              case 'reminder':
                event.status = EventCreationProgress.WaitingForReminder;
                break;
              default:
                event.status = EventCreationProgress.Done;
                msg = this.dictionary.get('/calendar/modify/unknown');
                msg = msg.replace('{option}', option);
            }

            sessionManager.setSession(message.author.id, event);
          } else {
            event.status = EventCreationProgress.Exit;
          }
        } else {
          switch (event.status) {
            case EventCreationProgress.WaitingForTime:
              try {
                const eventDate = DateValidation.validate(userInput, event.userTimeZone);
                await EventModel.findOneAndUpdate({shortId: event.shortId},{eventDate: eventDate.toDate()});
                const messageToUpdate = new Message(this.client, event.messageId);
                event.eventDate = eventDate.toDate();
                await messageToUpdate.updateEventMessage(event);
                event.status = EventCreationProgress.Done;
              } catch (e) {
                msg = e.message + ', ' + this.dictionary.get('/calendar/modify/exiting');
                event.status = EventCreationProgress.Done;
              }
              break;
            case EventCreationProgress.WaitingForTitle:
              if (userInput.length < 200) {
                event.title = userInput;
                await EventModel.findOneAndUpdate({shortId: event.shortId}, {title: userInput});
                const messageToUpdate = new Message(this.client, event.messageId);
                await messageToUpdate.updateEventMessage(event);
                event.status = EventCreationProgress.Done;
              } else {
                msg = this.dictionary.get('/calendar/creation/stringTooLong');
                msg = msg.replace('{length}', userInput.length.toString());
                msg = msg.replace('{allowed}', '200');
              }
              break;
            case EventCreationProgress.WaitingForDescription:
              event.description = userInput;
              await EventModel.findOneAndUpdate({shortId: event.shortId}, {description: userInput});
              const messageToUpdate = new Message(this.client, event.messageId);
              await messageToUpdate.updateEventMessage(event);
              event.status = EventCreationProgress.Done;
              break;
            case EventCreationProgress.WaitingForDelete:
              if (userInput === 'yes') {
                await EventModel.findOneAndUpdate({shortId: event.shortId}, {active: false});
                const messageToUpdate = new Message(this.client, event.messageId);
                await messageToUpdate.delete(event);
                event.status = EventCreationProgress.Done;
              }
              break;
            case EventCreationProgress.WaitingForReminder:
              if (isNumeric(userInput)) {
                await EventModel.findOneAndUpdate({shortId: event.shortId}, {reminder: parseInt(userInput, 10) });
                event.status = EventCreationProgress.Done;
              }
              break;
            default:
              msg = await this.getPreviousEvents(event)
              await message.author.send(msg);

              return EventCreationProgress.Exit;
          }
        }
      }

      console.log('displaying message');
      console.log(event.status);

      if (msg.length === 0) {
        switch (event.status) {
          case EventCreationProgress.WaitingForTime:
            msg = this.dictionary.get('/calendar/modify/changeTime');
            msg = msg.replace('{timezone}', event.userTimeZone);
            const m = moment(event.eventDate).tz(event.userTimeZone).format('DD-MM-yyyy HH:mm');
            msg = msg.replace('{currentdate}', m);
            break;
          case EventCreationProgress.WaitingForTitle:
            msg = this.dictionary.get('/calendar/modify/title');
            break;
          case EventCreationProgress.WaitingForDescription:
            msg = this.dictionary.get('/calendar/modify/description');
            break;
          case EventCreationProgress.Done:
            msg = this.dictionary.get('/calendar/modify/updated');
            break;
          case EventCreationProgress.Exit:
            msg = this.dictionary.get('/calendar/modify/exiting');
            break;
          case EventCreationProgress.WaitingForDelete:
            msg = this.dictionary.get('/calendar/modify/deleteConfirm');
            break;
          case EventCreationProgress.WaitingForReminder:
            msg = this.dictionary.get('/calendar/modify/reminderTime');
            break;
        }
      }

      if (msg.length) {
        await message.author.send(msg);
      }

      console.log('Running modify handler');
    }

    return event.status;
  }
}

export default ModifyHandler;
