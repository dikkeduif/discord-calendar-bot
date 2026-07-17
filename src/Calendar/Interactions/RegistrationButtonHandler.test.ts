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
import RegistrationButtonHandler from './RegistrationButtonHandler';
import { Event, EventModel } from '../Models/Event';

describe('RegistrationButtonHandler customId codec', () => {
  it('round-trips option indexes', () => {
    const id = RegistrationButtonHandler.encodeCustomId('abc123', 0);
    assert.equal(id, 'ev:reg:abc123:0');
    assert.deepEqual(RegistrationButtonHandler.decodeCustomId(id), { shortId: 'abc123', index: 0 });

    const high = RegistrationButtonHandler.encodeCustomId('zz99xx', 23);
    assert.deepEqual(RegistrationButtonHandler.decodeCustomId(high), { shortId: 'zz99xx', index: 23 });
  });

  it('round-trips the decline marker', () => {
    const id = RegistrationButtonHandler.encodeCustomId('abc123', 'decline');
    assert.equal(id, 'ev:reg:abc123:d');
    assert.deepEqual(RegistrationButtonHandler.decodeCustomId(id), { shortId: 'abc123', index: 'decline' });
  });

  it('rejects foreign and malformed customIds', () => {
    assert.equal(RegistrationButtonHandler.decodeCustomId('ev:del:abc123'), null);
    assert.equal(RegistrationButtonHandler.decodeCustomId('foo:bar:baz:0'), null);
    assert.equal(RegistrationButtonHandler.decodeCustomId('ev:reg:abc123:notanumber'), null);
    assert.equal(RegistrationButtonHandler.decodeCustomId('ev:reg:abc123'), null);
  });
});

describe('RegistrationButtonHandler.buildButtonRows', () => {
  const makeEvent = (optionCount: number) => {
    const event = new Event();
    for (let i = 0; i < optionCount; i++) {
      event.setOption('option' + i, 'Label ' + i);
    }
    event.shortId = 'abc123';
    return event;
  };

  it('lays buttons out five per row', () => {
    assert.equal(RegistrationButtonHandler.buildButtonRows(makeEvent(3)).length, 1);
    assert.equal(RegistrationButtonHandler.buildButtonRows(makeEvent(5)).length, 1);
    assert.equal(RegistrationButtonHandler.buildButtonRows(makeEvent(6)).length, 2);
    assert.equal(RegistrationButtonHandler.buildButtonRows(makeEvent(25)).length, 5);
  });

  it('caps legacy-interview excess at the 25-button message limit', () => {
    const rows = RegistrationButtonHandler.buildButtonRows(makeEvent(30));

    assert.equal(rows.length, 5);
    assert.equal(rows.reduce((sum, row) => sum + row.components.length, 0), 25);
  });

  it('returns no rows for events without options', () => {
    const event = new Event();
    event.shortId = 'abc123';
    assert.deepEqual(RegistrationButtonHandler.buildButtonRows(event), []);
  });

  it('encodes the decline option with the decline marker, others by index', () => {
    const event = new Event();
    event.shortId = 'abc123';
    event.setOption('🍕', 'Pizza');
    event.setDefaultDecline('No');

    const rows = RegistrationButtonHandler.buildButtonRows(event);
    const buttons = rows[0].components.map((b) => b.toJSON() as any);

    assert.equal(buttons[0].custom_id, 'ev:reg:abc123:0');
    assert.equal(buttons[1].custom_id, 'ev:reg:abc123:d');
    assert.equal(buttons[0].label, 'Pizza');
    assert.equal(buttons[1].label, 'No');
  });

  it('maps unicode, custom, and shortcode emoji keys onto button emoji', () => {
    const event = new Event();
    event.shortId = 'abc123';
    event.setOption('🍕', 'Unicode');
    event.setOption('<a:party:123456789>', 'Custom');
    event.setOption('pizza', 'Shortcode');
    event.setOption('notanemojiname', 'Unresolvable');

    const rows = RegistrationButtonHandler.buildButtonRows(event);
    const buttons = rows[0].components.map((b) => b.toJSON() as any);

    assert.equal(buttons[0].emoji.name, '🍕');
    assert.equal(buttons[1].emoji.id, '123456789');
    assert.equal(buttons[1].emoji.animated, true);
    assert.equal(buttons[2].emoji.name, '🍕');
    assert.equal(buttons[3].emoji, undefined);
    assert.equal(buttons[3].label, 'Unresolvable');
  });

  it('keeps keycap and flag emoji that the pictographic test misses', () => {
    const event = new Event();
    event.shortId = 'abc123';
    event.setOption('1️⃣', 'Keycap');
    event.setOption('🇧🇪', 'Flag');

    const rows = RegistrationButtonHandler.buildButtonRows(event);
    const buttons = rows[0].components.map((b) => b.toJSON() as any);

    assert.equal(buttons[0].emoji.name, '1️⃣');
    assert.equal(buttons[1].emoji.name, '🇧🇪');
  });

  it('truncates labels to the 80-char button limit', () => {
    const event = new Event();
    event.shortId = 'abc123';
    event.setOption('🍕', 'x'.repeat(120));

    const rows = RegistrationButtonHandler.buildButtonRows(event);
    assert.equal((rows[0].components[0].toJSON() as any).label.length, 80);
  });
});

describe('Event options Map order through mongoose (codec assumption)', () => {
  it('preserves insertion order across document hydration and toObject', () => {
    const keys = ['🍕', '<a:party:123456789>', '❔', '❎'];
    const event = new Event();
    for (const key of keys) {
      event.setOption(key, 'label ' + key);
    }

    const doc = new EventModel(event);
    assert.deepEqual(Array.from(doc.options.keys()), keys);

    const plain = doc.toObject();
    const rehydrated = new EventModel(plain);
    assert.deepEqual(Array.from(rehydrated.options.keys()), keys);
  });
});
