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
import {Event, OptionsType} from '../Models/Event';
import SessionType from '../Enums/SessionType';
import EventCreationProgress from '../Enums/EventCreationProgress';
import {User, UserModel} from '../Models/User';
import moment_tz from 'moment-timezone';
import Message from '../Classes/Message';
import DateValidation from '../Validation/DateValidation';
import EmojiValidation from '../Validation/EmojiValidation';
import {SessionManager} from '../Classes/SessionManager';
import Logger from '../../Bot/Logger';

class CreateHandler extends AbstractHandler {
  readonly client: Discord.Client

  public constructor(client: Discord.Client) {
    super('!event', ['text'], SessionType.CREATE);
    this.client = client;
  }

  public async processMessage(message: Discord.Message, event: Event, sessionManager: SessionManager): Promise<number> {
    if (event.sessionType === SessionType.CREATE) {
      let msg = '';

      const user = await UserModel.getUserByUserAndGuildId(event.authorId, event.guildId);
      const userInput = message.content;

      if (userInput !== '!event') {
        if (message.channel.type !== 'dm') {
          return event.status;
        }
      } else {
        if (message.channel.type !== 'text') {
          return event.status;
        }
      }

      // Check if the bot has permissions
      if (userInput === '!event') {
        try {
          await message.delete();

          if (!message.guild.me.hasPermission(['SEND_MESSAGES'])) {
            throw new Error('No permissions to send messages');
          }
        } catch (exception) {
          // @ts-ignore
          const channel: Discord.TextChannel = await this.client.channels.fetch(event.channelId)
          let msg = this.dictionary.get('/calendar/creation/noPermissions');
          msg = msg.replace('{channel}', channel.name);
          await message.author.send(msg);
          Logger.error(exception);
          return event.status;
        }
      }

      Logger.info(`Processing !event command on channelId ${message.channel.id} ${message.channel.type}`, { channel: message.channel })

      if (userInput === '!exit') {
        event.status = EventCreationProgress.Exit;
      } else if (userInput !== '!event') {
        switch (event.status) {
          case EventCreationProgress.WaitingForFirstTimeUser:
            if (userInput.toLowerCase() === 'ok') {
              event.status = EventCreationProgress.WaitingForTitle;
            }
            break;
          case EventCreationProgress.WaitingForTitle:
            if (userInput.length < 200) {
              event.title = userInput;
              event.status = EventCreationProgress.WaitingForDescription;
            } else {
              msg = this.dictionary.get('/calendar/creation/stringTooLong');
              msg = msg.replace('{allowed}', '200');
              msg = msg.replace('{length}', userInput.length.toString());
            }
            break;
          case EventCreationProgress.WaitingForDescription:
            event.description = userInput;
            if (user === null) {
              // User did not do the timezone setup yet
              event.status = EventCreationProgress.WaitingForUserTimeZone;
            } else {
              // User already completed timezones setup
              event.status = EventCreationProgress.WaitingForTimeZoneConfirmation;
            }
            break;
          case EventCreationProgress.WaitingForUserTimeZone:
            if (userInput.length === 2 && userInput.toLowerCase() !== 'ok') {
              msg = this.dictionary.get('/calendar/creation/pickOne') + '\n```' + moment_tz.tz.zonesForCountry(userInput).join('\n') + '```';
            } else {
              let timeZoneString = '';
              if (userInput.toLowerCase() === 'ok') {
                timeZoneString = event.eventTimeZone;
              } else {
                timeZoneString = userInput;
              }

              if (DateValidation.isValidTimeZone(timeZoneString)) {
                event.userTimeZone = timeZoneString;
                event.status = EventCreationProgress.WaitingForUserTimeZoneConfirmation;
              } else {
                msg = this.dictionary.get('/calendar/creation/invalidTimeZone');
              }
            }
            break;
          case EventCreationProgress.WaitingForUserTimeZoneConfirmation:
            if (userInput.toLowerCase() === 'ok') {
              if (!user) {
                const newUser: User = {};
                newUser.guildId = event.guildId;
                newUser.userId = event.authorId;
                newUser.active = true;
                newUser.userTimeZone = event.userTimeZone;
                newUser.eventTimeZone = event.eventTimeZone;
                await new UserModel(newUser).save();
              } else {
                await UserModel.findOneAndUpdate({ userId: message.author.id }, { userTimeZone: event.userTimeZone });
              }

              event.status = EventCreationProgress.WaitingForDate;
            } else if (userInput.toLowerCase() === 'edit') {
              event.status = EventCreationProgress.WaitingForUserTimeZone;
            }
            break;
          case EventCreationProgress.WaitingForTimeZoneConfirmation:
            if (userInput.toLowerCase() === 'ok') {
              event.status = EventCreationProgress.WaitingForDate;
            } else if (userInput.toLowerCase() === 'edit') {
              event.status = EventCreationProgress.WaitingForUserTimeZone;
            }
            break;
          case EventCreationProgress.WaitingForDate:
            try {
              const eventDate = DateValidation.validate(userInput + ' 23:59', event.userTimeZone);
              event.status = EventCreationProgress.WaitingForTime;
              event.eventDate = eventDate.toDate();
            } catch (e) {
              msg = e.message;
            }
            break;
          case EventCreationProgress.WaitingForTime:
            const myDate = moment_tz(event.eventDate).tz(event.userTimeZone).format('DD-MM-YYYY');
            try {
              const eventDate = DateValidation.validate(myDate + ' ' + userInput, event.userTimeZone);
              event.status = EventCreationProgress.WaitingForOptions;
              event.eventDate = eventDate.toDate();
            } catch (e) {
              msg = e.message;
            }
            break;
          case EventCreationProgress.WaitingForOptions:
            const params = userInput.split(' ');

            switch (params[0].toLowerCase()) {
              case 'default':
                event.setDefaultOptions();
                event.setDefaultDecline();
                event.optionsType = OptionsType.default;
                event.status = EventCreationProgress.Done;
                await new Message(this.client, '').postNewMessageAndUpdate(event);
                break;
              case 'clear':
                event.clearOptions();
                msg = this.dictionary.get('/calendar/creation/optionsCleared');
                break;
              case 'done':
                if (event.hasOptions()) {
                  event.optionsType = OptionsType.custom;
                  event.status = EventCreationProgress.WaitingForDeclineOption;
                } else {
                  event.optionsType = OptionsType.none;
                  event.status = EventCreationProgress.Done;
                  await new Message(this.client, '').postNewMessageAndUpdate(event);
                }
                break;
              default:
                if (params.length < 2) {
                  msg = this.dictionary.get('/calendar/creation/invalidOption');
                } else {
                  const validEmoji = EmojiValidation.isValidEmoji(params[0], this.client);
                  if (validEmoji !== false) {
                    event.setOption(validEmoji, userInput.replace(params[0], '').trim());
                    msg = this.dictionary.get('/calendar/creation/moreOptions');
                    let optionsStr = '';
                    if (event.options !== undefined) {
                      for (const [key, value] of event.options) {
                        optionsStr += key + ' ' + value + '\n';
                      }
                    }
                    msg = msg.replace('{options}', optionsStr);
                  } else {
                    msg = this.dictionary.get('/calendar/creation/invalidEmoji');
                  }
                }
                break;
            }
            break;
          case EventCreationProgress.WaitingForDeclineOption:
            switch (userInput.toLowerCase()) {
              case 'ok':
                event.status = EventCreationProgress.Done;
                await new Message(this.client, '').postNewMessageAndUpdate(event);
                break;
              case 'default':
                if (!EmojiValidation.emojiPartOfList(event.getDefaultDecline(), event.options)) {
                  event.setDefaultDecline();
                  event.status = EventCreationProgress.Done;
                  await new Message(this.client, '').postNewMessageAndUpdate(event);
                } else {
                  msg = this.dictionary.get('/calendar/creation/emojiInOptions');
                }
                break;
              default:
                const emoji = EmojiValidation.isValidEmoji(userInput, this.client);
                if (emoji !== false) {
                  if (EmojiValidation.emojiPartOfList(emoji, event.options)) {
                    msg = this.dictionary.get('/calendar/creation/emojiInOptions');
                  } else {
                    event.declineOption = emoji;
                    event.setOption(emoji, this.dictionary.get('/calendar/creation/decline'));
                    event.status = EventCreationProgress.Done;
                    await new Message(this.client, '').postNewMessageAndUpdate(event);
                  }
                } else {
                  msg = this.dictionary.get('/calendar/creation/invalidEmoji');
                }
                break;
            }
            break;
          default:
            event.status = 0;
        }
      }

      // If no message was set yet, set a new message
      if (msg.length === 0) {
        switch (event.status) {
          case EventCreationProgress.Exit:
            msg = this.dictionary.get('/calendar/creation/exit');
            break;
          case EventCreationProgress.Done:
            msg = this.dictionary.get('/calendar/creation/done');
            msg = msg.replace(/\{id\}/g, event.shortId);
            break;
          case EventCreationProgress.WaitingForFirstTimeUser:
            msg = this.dictionary.get('/calendar/creation/firstTimeUser');
            msg = msg.replace('{username}', message.author.username);
            msg = msg.replace('{guildname}', message.guild.name);
            break;
          case EventCreationProgress.WaitingForTitle:
            msg = this.dictionary.get('/calendar/creation/eventTitle');
            break;
          case EventCreationProgress.WaitingForDescription:
            msg = this.dictionary.get('/calendar/creation/eventBody');
            break;
          case EventCreationProgress.WaitingForServerTimeZone:
            msg = this.dictionary.get('/calendar/creation/eventTimeZone');
            msg = msg.replace('{timezone}', event.eventTimeZone);
            break;
          case EventCreationProgress.WaitingForServerTimeZoneConfirmation:
            msg = this.dictionary.get('/calendar/creation/confirmTimeZone');
            msg = msg.replace('{timezone}', event.eventTimeZone);
            const moment = moment_tz(new Date()).tz(event.eventTimeZone).format('DD-MM-yyyy HH:mm');
            msg = msg.replace('{datetime}', moment);
            break;
          case EventCreationProgress.WaitingForUserTimeZone:
            msg = this.dictionary.get('/calendar/creation/userTimeZone');
            msg = msg.replace('{timezone}', event.userTimeZone);
            break;
          case EventCreationProgress.WaitingForUserTimeZoneConfirmation:
            msg = this.dictionary.get('/calendar/creation/confirmTimeZone');
            const moment2 = moment_tz(new Date()).tz(event.userTimeZone).format('DD-MM-yyyy HH:mm');
            msg = msg.replace('{datetime}', moment2);
            msg = msg.replace('{timezone}', event.userTimeZone);
            break;
          case EventCreationProgress.WaitingForTimeZoneConfirmation:
            msg = this.dictionary.get('/calendar/creation/showChosenTimeZones');
            msg = msg.replace('{eventTimeZone}', event.eventTimeZone);
            msg = msg.replace('{userTimeZone}', event.userTimeZone);
            break;
          case EventCreationProgress.WaitingForDate:
            msg = this.dictionary.get('/calendar/creation/eventDate');
            break;
          case EventCreationProgress.WaitingForTime:
            msg = this.dictionary.get('/calendar/creation/eventTime');
            break;
          case EventCreationProgress.WaitingForOptions:
            msg = this.dictionary.get('/calendar/creation/options');
            break;
          case EventCreationProgress.WaitingForDeclineOption:
            msg = this.dictionary.get('/calendar/creation/declineOption');
            break;
          default:
            break;
        }
      }

      if (msg.length) {
        await message.author.send(msg);
      }
    }

    return event.status;
  }
}

export default CreateHandler;
