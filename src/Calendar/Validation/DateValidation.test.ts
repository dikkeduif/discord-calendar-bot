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

import { strict as assert } from 'assert';
import DateValidation from './DateValidation';
import DateExceedsLimit from '../Exceptions/DateExceedsLimit';
import InvalidDate from '../Exceptions/InvalidDate';
import InvalidTime from '../Exceptions/InvalidTime';

describe('DateValidation.validate', () => {
  it('accepts a valid future date and preserves the instant in the given zone', () => {
    const result = DateValidation.validate('31-12-2030 18:00', 'Europe/Brussels');

    assert.ok(result.isValid());
    assert.equal(result.format('DD-MM-YYYY HH:mm'), '31-12-2030 18:00');
    assert.equal(result.format('z'), 'CET');
  });

  it('rejects a past date with DateExceedsLimit', () => {
    assert.throws(() => DateValidation.validate('01-01-2020 12:00', 'Europe/London'), DateExceedsLimit);
  });

  it('rejects input without a time part as InvalidDate', () => {
    assert.throws(() => DateValidation.validate('31-12-2030', 'Europe/London'), InvalidDate);
  });

  it('rejects a nonsense date as InvalidDate', () => {
    assert.throws(() => DateValidation.validate('99-99-2030 18:00', 'Europe/London'), InvalidDate);
  });

  it('rejects an out-of-range hour like 25:30 as InvalidTime', () => {
    assert.throws(() => DateValidation.validate('31-12-2030 25:30', 'Europe/London'), InvalidTime);
  });

  it('rejects malformed minutes like 19:005 as InvalidTime', () => {
    assert.throws(() => DateValidation.validate('31-12-2030 19:005', 'Europe/London'), InvalidTime);
  });
});

describe('DateValidation.isValidTimeZone', () => {
  it('accepts a real IANA zone', () => {
    assert.equal(DateValidation.isValidTimeZone('Europe/London'), true);
  });

  it('rejects an unknown zone', () => {
    assert.equal(DateValidation.isValidTimeZone('Not/AZone'), false);
  });
});
