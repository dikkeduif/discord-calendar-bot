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

const CalendarTranslations = {
  calendar: {
    creation: {
      $filter: 'lang',
      'en': {
        noPermissions: 'Looks like I (the bot) don\'t have any write/edit permissions on channel {channel}, please fix my permissions first. I need the **Manage Messages** and **Send Messages** permissions',
        reactionPermissions: 'I\'m trying to manage the reactions on event **{event}** in channel **{channel}**, but I don\'t have enough rights. I need the **Manage Messages** permission',
        firstTimeUser: 'Hey **{username}**, thanks for using this bot for the first time on **{guildname}**.\nDuring the creation of this event I will ask you about **discord server** and **your personal** time zone. You only have to do this **once**! I will remember your choice for all future events created by you!\n\nType ``OK`` to continue or type ``!exit`` at any time do quit the event creation!',
        eventTitle: 'What is the **title** of your event? You can press **!exit** at any time to cancel',
        eventBody: 'What\'s the **description** of the event? This can have multiple lines and all sorts of markup:',
        eventTimeZone: 'Choose the time zone **to display** in the event. This is the time zone other people will see.\n\nCurrently selected: **{timezone}**\n\nType the country code (e.g. ``BE``, ``DE``, ``GB``, ``US``, ``CN``, ...) to get a list of time zones, or type your time zone directly, or type ``OK`` to continue',
        confirmTimeZone: 'You\'ve chosen **{timezone}** and the current date/time is **{datetime}**.\n\nType ``OK`` to continue. \nType ``edit`` to change it',
        userTimeZone: 'Choose **your personal time zone**. This is the time zone you live in or the time zone you want to use when you create a new event.\n\nCurrently selected: **{timezone}**\n\nType the country code (e.g. ``BE``, ``DE``, ``GB``, ``US``, ``CN``, ...) to get a list of time zones, or type your time zone directly (e.g ``Europe/London``), or type ``OK`` to continue',
        showChosenTimeZones: 'Your time zone is **{userTimeZone}**.\n\nType ``OK`` to continue.\nType ``edit`` to change time zones',
        eventDate: '**When** is the event? Date format dd-mm-yyyy (e.g, 31-07-2021)',
        eventTime: 'What **time**? (e.g 20:00)',
        invalidDate: 'The date you passed is invalid, the format should be format dd-mm-yyyy',
        invalidTime: 'The time you passed is invalid, the format should be format hh:mm (e.g. 18:00)',
        dateExceeded: 'The date you entered exceeds the current time of **{currentdate}** in time zone **{timezone}**',
        options: 'You can now choose **registration options**. \n\nType ``done`` for no registration options\nType ``default`` to use the default options (YES/NO/Uncertain)\nFor custom options type an **emoji** and a **name** for the first option, e.g :white_check_mark: ``Yes``',
        invalidOption: 'The option you passed is not valid, make sure it\'s something like this :gift:`` Alpha Team`` (with a space between the emoji and the name)',
        invalidValue: 'The value that you passed is not valid, try again',
        invalidEmoji: 'The emoji you entered is not supported, please try again',
        emojiInOptions: 'The emoji you want to use is already part of one of the registration options. Use another emoji',
        moreOptions: 'Ok, option saved. Type in the next option.\n\nType ``done`` when you\'re finished.\nType ``clear`` to start over.\n\n**NOTE** - Do not add an option for **declining**, I will ask you when you\'re done to add one\n\nCurrent options:\n{options}',
        optionsCleared: 'Ok, options have been cleared out. Type in the next option or type ``done`` when you are finished',
        done: 'Your event has been created! The event will be posted in the channel. Your event id is **{id}**. Type ``!modify`` to start modifying your events.\nType ``!modify {id} reminder`` to set an auto reminder',
        alreadyHaveSession: 'You\'re already creating an event, check your PMs',
        exiting: 'Your current event has been cancelled, create a new event with **!event** whenever you\'re ready!',
        footer: 'Your event ID is {id}',
        decline: 'N/A',
        stringTooLong: 'The text is too long, {length} characters. Max length={allowed} characters',
        pickOne: 'Pick one of the following options',
        invalidTimeZone: 'I couldn\'t find the time zone, type a country code (e.g. ``BE``, ``FR``, ``DE``, ...) to get a list of time zones for your country, or enter the time zone directly if you know it (e.g. ``Europe/London``)',
        exit: 'Ok, see you later!',
        declineOption: 'You can now enter an emoji for the option for a user to **decline**.\n\nType ``ok`` for no decline options.\nType ``default`` to use ❎ as the default.\nType a custom ``emoji``'
      }
    },
    modify: {
      $filter: 'lang',
      'en': {
        summary: 'These are the latest {amount} events.\nTo modify one of these type ``!modify id field``. You can find the **id** of your event in the footer of your event message.\n\nPossible options for **field** are ``title``, ``description``, ``time``, ``reminder`` and ``delete``\n(e.g. for changing the description type ``!modify acd3fd description``)\n\n{events}',
        eventTitle: 'You\'re modifying the title of the event, current title is `{title}`. Type a new title to override or type **!exit** to cancel',
        changeTime: 'What time do you want to change the event to? Current time is set to **{currentdate}** in time zone **{timezone}**. The format is DD-MM-YYYY HH:MM',
        title: 'What\'s the new title for this event?',
        description: 'What\'s the new description of this event?',
        updated: 'Your event has been updated!',
        unknown: 'The option ``{option}`` is invalid',
        deleteConfirm: 'Are you sure you want to delete this event? Type ``yes`` to confirm or type ``!exit``',
        reminderTime: 'I can send a reminder to all users that registered for an event, with the exception of the users that declined.\n\nType a ``number`` which will be the amount in minutes before the event starts. Type ``!exit`` to end',
        exiting: 'Exiting'
      }
    },
    reminder: {
      $filter: 'lang',
      'en': {
        channelReminder: 'Hey {userIds}, you registered for the event ``{title}`` on {date}. We\'re about to start in {minutes} minutes',
        remind: 'Hey {username}, this is a reminder for the event **{title}** for which you registered. The event will start in **{minutes} minutes**!\n\nHere are the events details:'
      }
    },
    general: {
      $filter: 'lang',
      'en': {
        noEvent: 'There is currently no event active for editing, start a new event with **!event** in the channel of your choice or type **!help** here to get an overview of commands',
        help: 'You can create a new event by typing ``!event`` in the channel of your choice. The event will be created in that channel.\n\nTo modify your event type ``!modify`` in a **direct message** to me.',
        sessionEnd: 'We closed your session, you can type ``!help`` to get a list of commands.'
      }
    }
  }
}

export { CalendarTranslations };
