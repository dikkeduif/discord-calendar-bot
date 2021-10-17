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

enum EventCreationProgress {
  WaitingForFirstTimeUser = 1,
  WaitingForTitle = 5,
  WaitingForDescription = 10,
  WaitingForServerTimeZone = 20,
  WaitingForServerTimeZoneConfirmation = 22,
  WaitingForUserTimeZone = 24,
  WaitingForUserTimeZoneConfirmation = 26,
  WaitingForTimeZoneConfirmation = 28,
  WaitingForDate = 30,
  WaitingForTime = 31,
  WaitingForOptions = 40,
  WaitingForDeclineOption = 45,
  WaitingForDelete = 50,
  WaitingForReminder = 55,
  Done = 100,
  Exit = 101
}

export default EventCreationProgress;