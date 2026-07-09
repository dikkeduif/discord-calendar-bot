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
import { EventModel } from '../Calendar/Models/Event';
import AdminActions, { ActionOutcome } from '../Calendar/Services/AdminActions';
import AdminCommand from '../Calendar/Interactions/AdminCommand';
import Logger from '../Bot/Logger';
import { html, layout } from './Html';

/**
 * The dashboard's four mutations, identical to their Discord
 * counterparts by construction: every route delegates to AdminActions
 * with the owner scope. Destructive actions go through a confirm page;
 * everything redirects after POST with a flash message.
 */
export function registerDashboardActions(app: express.Express, client: Discord.Client) {
  const actions = () => new AdminActions(client);

  app.get('/confirm/leave/:guildId', (req, res) => {
    if (!AdminCommand.isSnowflake(req.params.guildId)) {
      res.redirect('/');
      return;
    }
    const guild = client.guilds.cache.get(req.params.guildId);
    res.send(layout('Leave guild?', html`
      <h1>Leave ${guild !== undefined ? guild.name : req.params.guildId}?</h1>
      <p>Its native scheduled events are removed and its bot events close first. Registrations are kept in the database.</p>
      <form method="post" action="/action/leave/${req.params.guildId}"><button class="danger">Yes, leave</button></form>
      <p><a href="/">Cancel</a></p>`));
  });

  app.post('/action/leave/:guildId', async (req, res) => {
    if (!AdminCommand.isSnowflake(req.params.guildId)) {
      res.redirect('/');
      return;
    }
    const outcome = await actions().leaveGuild(req.params.guildId);
    audit('leaveGuild', req.params.guildId, outcome);

    const message = outcome.status === 'owned'
      ? 'I own that guild and cannot leave it (events were closed anyway)'
      : 'Left the guild — closed ' + (outcome.deactivated ?? 0) + ' event(s)'
        + (outcome.status === 'already' ? ' (was already gone)' : '');
    res.redirect('/?msg=' + encodeURIComponent(message));
  });

  app.get('/confirm/delete/:shortId', async (req, res) => {
    const event = await EventModel.findOne({ shortId: req.params.shortId, active: true });
    if (event === null) {
      res.redirect('/?msg=' + encodeURIComponent('That event is already gone'));
      return;
    }
    res.send(layout('Delete event?', html`
      <h1>Delete “${event.title}”?</h1>
      <p>This removes the event message and its registrations, exactly like /event delete.</p>
      <form method="post" action="/action/delete/${event.shortId}"><button class="danger">Yes, delete</button></form>
      <p><a href="/event/${event.shortId}">Cancel</a></p>`));
  });

  app.post('/action/delete/:shortId', async (req, res) => {
    const event = await EventModel.findOne({ shortId: req.params.shortId });
    const outcome = await actions().deleteEvent(req.params.shortId, { ownerBypass: true });
    audit('deleteEvent', req.params.shortId, outcome);

    const target = event !== null && event.guildId ? '/guild/' + event.guildId : '/';
    const message = outcome.status === 'done' ? 'Event deleted' : 'That event was already gone';
    res.redirect(target + '?msg=' + encodeURIComponent(message));
  });

  app.post('/action/detach/:channelId', async (req, res) => {
    if (!AdminCommand.isSnowflake(req.params.channelId)) {
      res.redirect('/');
      return;
    }
    const cached: any = client.channels.cache.get(req.params.channelId);
    const outcome = await actions().detachChannel(req.params.channelId, cached?.guildId);
    audit('detachChannel', req.params.channelId, outcome);

    const message = outcome.status === 'already'
      ? 'Channel was already detached'
      : 'Channel detached — closed ' + (outcome.deactivated ?? 0) + ' event(s)';
    res.redirect(backTo(req, cached?.guildId) + '?msg=' + encodeURIComponent(message));
  });

  // Drift cleanups. Ghost cleanup gets the double confirm the plan
  // requires: scan → this page → POST
  app.get('/confirm/cleanup-ghost/:guildId', (req, res) => {
    if (!AdminCommand.isSnowflake(req.params.guildId)) {
      res.redirect('/drift');
      return;
    }
    res.send(layout('Clean up ghost guild?', html`
      <h1>Clean up ghost guild <code>${req.params.guildId}</code>?</h1>
      <p>The bot is no longer in this guild. Its remaining active events will be closed locally; native
      events there cannot be touched anymore. If the bot gets re-invited, closed events stay closed.</p>
      <form method="post" action="/action/cleanup-ghost/${req.params.guildId}"><button class="danger">Yes, clean up</button></form>
      <p><a href="/drift">Cancel</a></p>`));
  });

  app.post('/action/cleanup-ghost/:guildId', async (req, res) => {
    if (!AdminCommand.isSnowflake(req.params.guildId)) {
      res.redirect('/drift');
      return;
    }
    // leaveGuild handles the already-gone case as pure local cleanup
    const outcome = await actions().leaveGuild(req.params.guildId);
    audit('cleanupGhostGuild', req.params.guildId, outcome);
    res.redirect('/drift?msg=' + encodeURIComponent('Cleaned up — closed ' + (outcome.deactivated ?? 0) + ' event(s)'));
  });

  app.post('/action/quarantine/:channelId', async (req, res) => {
    if (!AdminCommand.isSnowflake(req.params.channelId)) {
      res.redirect('/drift');
      return;
    }
    const outcome = await actions().quarantineChannel(req.params.channelId, undefined);
    audit('quarantineChannel', req.params.channelId, outcome);
    res.redirect('/drift?msg=' + encodeURIComponent('Channel quarantined — closed ' + (outcome.deactivated ?? 0) + ' event(s)'));
  });

  app.post('/action/clear-mirror/:shortId', async (req, res) => {
    const outcome = await actions().clearMirror(req.params.shortId);
    audit('clearMirror', req.params.shortId, outcome);
    res.redirect('/drift?msg=' + encodeURIComponent(outcome.status === 'done' ? 'Stale reference cleared' : 'Nothing to clear'));
  });

  app.post('/action/reattach/:channelId', async (req, res) => {
    if (!AdminCommand.isSnowflake(req.params.channelId)) {
      res.redirect('/');
      return;
    }
    const cached: any = client.channels.cache.get(req.params.channelId);
    const outcome = await actions().reattachChannel(req.params.channelId);
    audit('reattachChannel', req.params.channelId, outcome);

    const message = outcome.status === 'notFound'
      ? 'That channel was not detached'
      : 'Channel reattached — new events allowed again';
    res.redirect(backTo(req, cached?.guildId) + '?msg=' + encodeURIComponent(message));
  });
}

function backTo(req: express.Request, guildId: string | undefined): string {
  return guildId !== undefined ? '/guild/' + guildId : '/';
}

function audit(action: string, target: string, outcome: ActionOutcome) {
  Logger.info('Admin action', { action, target, surface: 'web', outcome: outcome.status });
}
