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

import express from 'express';
import * as Discord from 'discord.js';
import moment_tz from 'moment-timezone';
import { EventModel } from '../Calendar/Models/Event';
import ChannelStateCache from '../Calendar/Services/ChannelStateCache';
import { html, raw, layout } from './Html';
import { registerDashboardActions } from './Actions';
import { runDriftScan, DriftFindings } from './Drift';
import Logger from '../Bot/Logger';

const MAX_EVENT_ROWS = 100;

export function registerDashboardRoutes(app: express.Express, client: Discord.Client) {
  app.get('/', async (req, res) => {
    const counts = await EventModel.getActiveCountsByGuild();
    const cachedIds = new Set(client.guilds.cache.keys());

    const rows = client.guilds.cache.map((guild) => html`
      <tr>
        <td><a href="/guild/${guild.id}">${guild.name}</a></td>
        <td>${counts.get(guild.id) ?? 0}</td>
        <td><code>${guild.id}</code></td>
        <td class="actions">
          <form method="get" action="/confirm/leave/${guild.id}"><button class="danger">Leave…</button></form>
        </td>
      </tr>`);

    // Guilds that only exist in the database: the bot was kicked but
    // active events remain. Names come from the denormalized snapshot
    const ghosts: string[] = [];
    for (const [guildId, count] of counts) {
      if (guildId && !cachedIds.has(guildId)) {
        const sample = await EventModel.findOne({ guildId, active: true });
        ghosts.push(html`
          <tr>
            <td>${sample?.guildName ?? 'unknown'} <span class="badge warn">ghost</span></td>
            <td>${count}</td>
            <td><code>${guildId}</code></td>
            <td>see <a href="/drift">drift report</a></td>
          </tr>`);
      }
    }

    res.send(layout('Guilds', html`
      ${raw(flash(req))}
      <h1>Guilds</h1>
      <table>
        <tr><th>Guild</th><th>Active events</th><th>Id</th><th></th></tr>
        ${raw(rows.join(''))}
        ${raw(ghosts.join(''))}
      </table>`));
  });

  app.get('/guild/:guildId', async (req, res) => {
    const guildId = req.params.guildId;
    const guild = client.guilds.cache.get(guildId);
    const includeInactive = req.query.all === '1';

    const filter: any = { guildId };
    if (!includeInactive) {
      filter.active = true;
    }
    const events = await EventModel.find(filter).sort({ eventDate: 1 }).limit(MAX_EVENT_ROWS + 1);
    const truncated = events.length > MAX_EVENT_ROWS;
    const shown = truncated ? events.slice(0, MAX_EVENT_ROWS) : events;

    const channelName = (channelId: string) => {
      const cached: any = client.channels.cache.get(channelId);
      return cached !== undefined && cached.name ? '#' + cached.name : channelId;
    };

    const channelBadge = (channelId: string) => {
      const state = ChannelStateCache.getState(channelId);
      return state === undefined ? '' : html` <span class="badge warn">${state}</span>`;
    };

    const rows = shown.map((event) => html`
      <tr>
        <td><a href="/event/${event.shortId}">${event.title}</a>${event.active ? '' : raw(' <span class="badge">inactive</span>')}</td>
        <td>${moment_tz(event.eventDate).tz(event.eventTimeZone || 'UTC').format('DD-MM-YYYY HH:mm')}</td>
        <td>${channelName(event.channelId)}${raw(channelBadge(event.channelId))}</td>
        <td>${event.registrations ? event.registrations.size : 0}</td>
      </tr>`);

    // Channels worth acting on: any channel carrying events, plus any
    // currently blocked channel in this guild
    const channelIds = new Set<string>(shown.map((event) => event.channelId));
    for (const entry of ChannelStateCache.entries()) {
      channelIds.add(entry.channelId);
    }

    const channelRows = Array.from(channelIds)
      .filter((channelId) => {
        const cached: any = client.channels.cache.get(channelId);
        return cached?.guildId === guildId || shown.some((event) => event.channelId === channelId);
      })
      .map((channelId) => {
        const state = ChannelStateCache.getState(channelId);
        const action = state === undefined
          ? html`<form method="post" action="/action/detach/${channelId}"><button class="danger">Detach</button></form>`
          : html`<form method="post" action="/action/reattach/${channelId}"><button>Reattach</button></form>`;
        return html`
          <tr>
            <td>${channelName(channelId)}${raw(channelBadge(channelId))}</td>
            <td><code>${channelId}</code></td>
            <td class="actions">${raw(action)}</td>
          </tr>`;
      });

    res.send(layout(guild !== undefined ? guild.name : guildId, html`
      ${raw(flash(req))}
      <h1>${guild !== undefined ? guild.name : guildId} ${guild === undefined ? raw('<span class="badge warn">ghost</span>') : ''}</h1>
      <p>
        <a href="/guild/${guildId}${includeInactive ? '' : '?all=1'}">${includeInactive ? 'Hide inactive events' : 'Include inactive events'}</a>
      </p>
      <h2>Events${truncated ? raw(' <span class="badge">showing first ' + MAX_EVENT_ROWS + '</span>') : ''}</h2>
      <table>
        <tr><th>Title</th><th>When</th><th>Channel</th><th>Registered</th></tr>
        ${raw(rows.join(''))}
      </table>
      <h2>Channels</h2>
      <table>
        <tr><th>Channel</th><th>Id</th><th></th></tr>
        ${raw(channelRows.join(''))}
      </table>
      <form method="get" action="/confirm/leave/${guildId}"><button class="danger">Leave this guild…</button></form>`));
  });

  app.get('/event/:shortId', async (req, res) => {
    const event = await EventModel.findOne({ shortId: req.params.shortId });
    if (event === null) {
      res.status(404).send(layout('Not found', '<p>No such event.</p>'));
      return;
    }

    const userName = (userId: string) => {
      const cached = client.users.cache.get(userId);
      return cached !== undefined ? cached.username : userId;
    };

    const optionRows: string[] = [];
    if (event.options) {
      for (const [key, label] of event.options) {
        const registrants: string[] = [];
        if (event.registrations) {
          for (const [userId, optionKey] of event.registrations) {
            if (optionKey === key) {
              registrants.push(userName(userId));
            }
          }
        }
        optionRows.push(html`
          <tr>
            <td>${key} ${label}${key === event.declineOption ? raw(' <span class="badge">decline</span>') : ''}</td>
            <td>${registrants.length > 0 ? registrants.join(', ') : '—'}</td>
          </tr>`);
      }
    }

    res.send(layout(event.title ?? event.shortId, html`
      ${raw(flash(req))}
      <h1>${event.title} ${event.active ? '' : raw('<span class="badge warn">inactive</span>')}</h1>
      <p>${event.description}</p>
      <table>
        <tr><th>When</th><td>${moment_tz(event.eventDate).tz(event.eventTimeZone || 'UTC').format('dddd DD-MM-YYYY HH:mm z')}</td></tr>
        <tr><th>Guild</th><td><a href="/guild/${event.guildId}">${event.guildName ?? event.guildId}</a></td></tr>
        <tr><th>Channel</th><td><code>${event.channelId}</code></td></tr>
        <tr><th>Reminder</th><td>${event.reminder ? event.reminder + ' min before' : 'off'}${event.reminderSent ? ' (sent)' : ''}</td></tr>
        <tr><th>Ids</th><td>short <code>${event.shortId}</code> · message <code>${event.messageId ?? '—'}</code> · native event <code>${event.scheduledEventId ?? '—'}</code></td></tr>
      </table>
      <h2>Registrations</h2>
      <table>
        <tr><th>Option</th><th>Registered</th></tr>
        ${raw(optionRows.join(''))}
      </table>
      ${event.active ? raw(html`<form method="get" action="/confirm/delete/${event.shortId}"><button class="danger">Delete event…</button></form>`) : ''}`));
  });

  // Last scan is kept in memory: single owner, single process, and the
  // page says when it ran
  let lastScan: { findings: DriftFindings, at: Date } | null = null;

  app.get('/drift', (req, res) => {
    let body = html`${raw(flash(req))}<h1>Drift report</h1>
      <p>Compares the database against Discord: guilds that kicked the bot, deleted channels, vanished Events-tab entries.</p>
      <form method="post" action="/drift"><button>Run scan</button></form>`;

    if (lastScan !== null) {
      const ghosts = lastScan.findings.ghostGuilds.map((ghost) => html`
        <tr><td>${ghost.guildName}</td><td><code>${ghost.guildId}</code></td><td>${ghost.activeEvents}</td>
        <td><form method="get" action="/confirm/cleanup-ghost/${ghost.guildId}"><button class="danger">Clean up…</button></form></td></tr>`);
      const dead = lastScan.findings.deadChannels.map((channel) => html`
        <tr><td><code>${channel.channelId}</code></td><td>${channel.events}</td>
        <td><form method="post" action="/action/quarantine/${channel.channelId}"><button class="danger">Quarantine</button></form></td></tr>`);
      const mirrors = lastScan.findings.vanishedMirrors.map((mirror) => html`
        <tr><td><a href="/event/${mirror.shortId}">${mirror.shortId}</a></td><td><code>${mirror.scheduledEventId}</code></td>
        <td><form method="post" action="/action/clear-mirror/${mirror.shortId}"><button>Clear reference</button></form></td></tr>`);

      body += html`<p>Last scan: ${lastScan.at.toISOString()} — re-run after cleanups.</p>
        <h2>Ghost guilds (${lastScan.findings.ghostGuilds.length})</h2>
        <table><tr><th>Guild</th><th>Id</th><th>Active events</th><th></th></tr>${raw(ghosts.join(''))}</table>
        <h2>Dead channels (${lastScan.findings.deadChannels.length})</h2>
        <table><tr><th>Channel id</th><th>Active events</th><th></th></tr>${raw(dead.join(''))}</table>
        <h2>Vanished native events (${lastScan.findings.vanishedMirrors.length})</h2>
        <table><tr><th>Event</th><th>Native event id</th><th></th></tr>${raw(mirrors.join(''))}</table>`;
    }

    res.send(layout('Drift report', body));
  });

  app.post('/drift', async (req, res) => {
    try {
      lastScan = { findings: await runDriftScan(client), at: new Date() };
      res.redirect('/drift?msg=' + encodeURIComponent('Scan complete'));
    } catch (err) {
      Logger.error('Drift scan failed: ' + err.message);
      res.redirect('/drift?msg=' + encodeURIComponent('Scan refused: ' + err.message));
    }
  });

  registerDashboardActions(app, client);
}

/** Escaped flash message from the ?msg= query param (set by PRG redirects). */
export function flash(req: express.Request): string {
  const message = req.query.msg;
  return typeof message === 'string' && message.length > 0
    ? html`<p class="flash">${message}</p>`
    : '';
}
