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

import moment from 'moment-timezone';
import DateExceedsLimit from '../Exceptions/DateExceedsLimit';
import InvalidDate from '../Exceptions/InvalidDate';
import InvalidTime from '../Exceptions/InvalidTime';

export default class DateValidation {
  /**
   * Validate a date string
   * @param dateString
   * @param timeZoneString
   * @throws DateExceedsLimit|InvalidDate|Error
   */
  static validate(dateString: string, timeZoneString: string): moment.Moment {

    const parts = dateString.split(' ');
    if (parts.length !== 2) {
      throw new InvalidDate();
    }
    const timePart = parts[1];
    if (!DateValidation.isValidTime(timePart)) {
      throw new InvalidTime()
    }
    const eventDate = moment.tz(dateString, 'DD-MM-YYYY HH:mm', timeZoneString);
    if (eventDate.isValid()) {
      if (eventDate.unix() > moment().unix()) {
        return eventDate;
      } else {
        throw new DateExceedsLimit(timeZoneString);
      }
    } else {
      throw new InvalidDate();
    }
  }

  static isValidTime(timeString) {
    if (timeString.match(/([01]?[0-9]|2[0-3]):[0-5][0-9]/)) {
      return true;
    }

    return false;
  }

  static isValidTimeZone(timeZoneString) {
    const timezone = moment().tz(timeZoneString);
    if (timezone.zoneName().length > 0) {
      return true;
    }

    return false;
  }
}