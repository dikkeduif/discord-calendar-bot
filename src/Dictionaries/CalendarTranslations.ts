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
    interaction: {
      $filter: 'lang',
      'en': {
        error: 'Something went wrong while handling that. Please try again.',
        registrationClosed: 'Registration for this event is closed.',
        registrationPending: 'This event was just posted and isn\'t ready yet — click again in a few seconds.',
        modalTitle: 'Create an event',
        fieldTitle: 'Title',
        fieldDescription: 'Description',
        fieldDate: 'Date (DD-MM-YYYY)',
        fieldTime: 'Time (HH:MM)',
        fieldOptions: 'Registration options',
        fieldOptionsHint: 'One "emoji label" per line. Leave blank for ✅ Yes / ❔ Maybe.',
        wrongChannel: 'Use this command in a regular text channel — that\'s where I can post and remind.',
        noBotPermissions: 'I can\'t post here — I need the **View Channel**, **Send Messages** and **Embed Links** permissions in this channel.',
        noUserPermissions: 'You need permission to send messages in this channel to create an event here.',
        created: 'Your event is posted! The id is **{id}** — use ``/event modify`` to change it or set a reminder.',
        timezoneNotice: 'I read your date and time as **{timezone}**. Use ``/timezone set`` to change how I read them.',
        postFailed: 'I couldn\'t post the event in this channel, so nothing was created. Check my permissions here and try again.',
        retryLabel: 'Try again',
        retryExpired: 'Your input expired — run ``/event create`` again. Your values are echoed above for copy/paste.',
        declineLabel: 'No',
        yourInput: 'Your input:',
        optionsInvalidEmoji: 'I don\'t recognize the emoji in ``{line}`` — use a standard emoji, a ``:shortcode:``, or a custom emoji from a server I\'m in.',
        optionsMissingLabel: 'Add a label after the emoji in ``{line}``.',
        optionsLabelTooLong: 'The label in ``{line}`` is over 80 characters.',
        optionsDuplicate: 'The emoji in ``{line}`` is used more than once.',
        optionsDeclineCollision: '❎ is reserved for the decline button — pick another emoji in ``{line}``.',
        optionsTooMany: 'Events support at most 24 options.',
        modifyModalTitle: 'Modify your event',
        fieldDateHint: 'Interpreted in {timezone} — change yours with /timezone set',
        fieldReminder: 'Reminder (minutes before start)',
        fieldReminderHint: 'Leave blank to keep the current setting, 0 to turn the reminder off.',
        eventGone: 'That event doesn\'t exist anymore — pick one from the list ``/event modify`` suggests.',
        reminderInvalid: 'The reminder must be a whole number of minutes, e.g. ``30``, or ``0`` to turn it off.',
        modifyUpdated: 'Your event is updated.',
        modifyMessageGone: 'I saved your changes, but the event message seems to be gone from the channel. Use ``/event delete`` to clean the event up, or ``/event create`` to start fresh.',
        deleteConfirm: 'Delete **{title}**? This removes the event message and its registrations.',
        deleteConfirmLabel: 'Delete event',
        deleteDone: '**{title}** is deleted.',
        deleteAlready: 'That event was already deleted.',
        timezoneSet: 'Your timezone here is now **{zone}** (was {previous}). I\'ll use it to read the dates and times you type.',
      },
    },
    scheduledEvent: {
      $filter: 'lang',
      'en': {
        signupHint: 'Sign up via the reactions on the event message in #{channel}. Marking yourself interested here does not register you.',
      },
    },
    reminder: {
      $filter: 'lang',
      'en': {
        channelReminder: 'Hey {userIds}, you registered for the event ``{title}`` on {date}. We\'re about to start in {minutes} minutes'
      }
    },
    general: {
      $filter: 'lang',
      'en': {
        noEvent: 'There is currently no event active for editing, start a new event with **!event** in the channel of your choice or type **!help** here to get an overview of commands',
        help: '**Creating events**\nUse ``/event create`` in the channel where the event should live — a form opens for the title, description, date, time and registration options. People sign up with the buttons under the event.\n\n**Managing events**\n``/event modify`` changes one of your upcoming events (including its reminder), ``/event delete`` removes one. ``/timezone set`` controls how I read the dates and times you type.\n\nThe old ``!`` commands still work for now, but they are retiring soon.',
        deprecationNudge: '💡 The ``!`` commands are retiring soon — use ``/event create`` in your server instead. If you don\'t see the slash commands there, a server admin needs to re-authorize the bot with the invite link from the README.',
        sessionEnd: 'We closed your session, you can type ``!help`` to get a list of commands.'
      }
    }
  }
}

export { CalendarTranslations };
