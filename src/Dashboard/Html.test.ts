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
import { html, raw, layout } from './Html';

describe('html tagged template', () => {
  it('escapes interpolated values by default', () => {
    const out = html`<p>${'<script>alert(1)</script>'}</p>`;

    assert.equal(out, '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
  });

  it('escapes attribute-breaking quotes', () => {
    const out = html`<a title="${'" onmouseover="alert(1)'}">x</a>`;

    assert.ok(!out.includes('" onmouseover="'));
    assert.ok(out.includes('&quot;'));
  });

  it('passes raw() fragments through unchanged', () => {
    const inner = html`<b>${'safe & sound'}</b>`;
    const out = html`<div>${raw(inner)}</div>`;

    assert.equal(out, '<div><b>safe &amp; sound</b></div>');
  });

  it('joins arrays of fragments and stringifies primitives', () => {
    const rows = ['a<b', 'c'].map((v) => html`<li>${v}</li>`);
    const out = html`<ul>${raw(rows.join(''))}</ul><span>${42}</span>`;

    assert.equal(out, '<ul><li>a&lt;b</li><li>c</li></ul><span>42</span>');
  });

  it('renders null and undefined as empty', () => {
    assert.equal(html`<i>${undefined}${null}</i>`, '<i></i>');
  });
});

describe('layout', () => {
  it('escapes the page title and embeds the body as-is', () => {
    const page = layout('<Evil> & Title', '<main>body</main>');

    assert.ok(page.includes('&lt;Evil&gt; &amp; Title'));
    assert.ok(page.includes('<main>body</main>'));
  });
});
