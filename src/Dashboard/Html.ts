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

/**
 * Escape-by-default HTML rendering: every interpolation in the html``
 * tag is escaped unless explicitly wrapped in raw(). Event titles,
 * descriptions, guild names, and option labels are all arbitrary user
 * input — remember-to-escape is the bug class this removes. Only
 * interpolate into element text or quoted attribute values.
 */

class RawHtml {
  constructor(public readonly value: string) {}
}

export function raw(value: string): RawHtml {
  return new RawHtml(value);
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function html(strings: TemplateStringsArray, ...values: unknown[]): string {
  let out = '';
  for (let i = 0; i < strings.length; i++) {
    out += strings[i];
    if (i < values.length) {
      const value = values[i];
      if (value instanceof RawHtml) {
        out += value.value;
      } else if (value !== null && value !== undefined) {
        out += escapeHtml(String(value));
      }
    }
  }
  return out;
}

const STYLE = `
  body { font-family: system-ui, sans-serif; max-width: 60rem; margin: 1rem auto; padding: 0 1rem; color: #222; }
  table { border-collapse: collapse; width: 100%; margin: .5rem 0 1.5rem; }
  th, td { text-align: left; padding: .4rem .6rem; border-bottom: 1px solid #ddd; vertical-align: top; }
  .badge { font-size: .75rem; padding: .1rem .4rem; border-radius: .3rem; background: #eee; }
  .badge.warn { background: #fde2e2; }
  .actions form { display: inline; }
  button { padding: .3rem .8rem; cursor: pointer; }
  button.danger { background: #c0392b; color: white; border: none; border-radius: .3rem; }
  .flash { background: #e8f6e8; padding: .5rem .8rem; border-radius: .3rem; }
  nav a { margin-right: 1rem; }
`;

export function layout(title: string, body: string): string {
  return '<!doctype html><html><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width, initial-scale=1">'
    + '<title>' + escapeHtml(title) + '</title>'
    + '<style>' + STYLE + '</style>'
    + '</head><body>'
    + '<nav><a href="/">Guilds</a><a href="/drift">Drift report</a></nav>'
    + body
    + '</body></html>';
}
