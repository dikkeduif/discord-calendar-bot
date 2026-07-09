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
import * as Discord from 'discord.js';
import { Calendar } from './Calendar'
import DashboardServer from './Dashboard/Server';
import { registerDashboardRoutes } from './Dashboard/Views';
import Logger from './Bot/Logger';
import Settings from './settings';
import { connect } from './Entities/Mongoose';

if (!Settings.get('/discord/token')) {
  Logger.error('DISCORD_TOKEN environment variable is not set');
  process.exit(1);
}

if (!Settings.get('/databases/mongoose/connection')) {
  Logger.error('MONGODB_CONNECTION_STRING environment variable is not set');
  process.exit(1);
}

// Safety net: a failed interaction must never take the whole bot down
process.on('unhandledRejection', (reason: any) => {
  Logger.error('Unhandled promise rejection', { reason: reason instanceof Error ? reason.stack : reason });
});

process.on('uncaughtException', (err) => {
  Logger.error('Uncaught exception', { stack: err.stack });
  process.exit(1);
});

connect().catch((err) => {
  Logger.error('MongoDB initial connection failed: ' + err.message);
  process.exit(1);
});

const client = new Discord.Client({
  intents: [
    Discord.GatewayIntentBits.Guilds,
    Discord.GatewayIntentBits.GuildMessages,
    // Privileged: must also be toggled in the Developer Portal, or login
    // fails with DisallowedIntents
    Discord.GatewayIntentBits.MessageContent,
    Discord.GatewayIntentBits.GuildMessageReactions,
    Discord.GatewayIntentBits.DirectMessages,
  ],
  partials: [Discord.Partials.Message, Discord.Partials.Channel, Discord.Partials.Reaction],
  // Reminders ping registrants via user mentions; everyone/here/roles
  // never parse, so quoted user input cannot mass-mention
  allowedMentions: { parse: ['users'] },
});

client.on('clientReady', () => {
  Logger.info('Discord client connected');
  Logger.info(`Found environment ${Settings.get('/environment')}`);

  calendar.registerCommands().catch((err) => {
    Logger.error('Slash command registration failed: ' + err.message);
  });

  calendar.loadChannelStates().catch((err) => {
    Logger.error('Channel state load failed: ' + err.message);
  });

  if (DashboardServer.shouldStart()) {
    try {
      dashboard = new DashboardServer();
      dashboard.registerRoutes((app) => registerDashboardRoutes(app, client));
      dashboard.start();
    } catch (err) {
      // A weak token or bad config must not take the bot down
      Logger.error('Dashboard not started: ' + err.message);
    }
  } else {
    Logger.info('Dashboard disabled (set ADMIN_PORT, ADMIN_TOKEN and OWNER_USER_ID to enable)');
  }
});

client.on('error', (err) => {
  Logger.error('Discord client error: ' + err.message);
});

client.on('shardError', (err) => {
  Logger.error('Discord shard error: ' + err.message);
});

const calendar = new Calendar(client);
calendar.start();

let dashboard: DashboardServer | null = null;

// pm2-runtime signals on every redeploy; close the HTTP side first so
// in-flight requests drain, then the Discord client
const shutdown = (signal: string) => {
  Logger.info('Received ' + signal + ', shutting down');
  const stopServer = dashboard !== null ? dashboard.stop() : Promise.resolve();
  stopServer
    .then(() => client.destroy())
    .catch((err) => Logger.error('Shutdown error: ' + err.message))
    .finally(() => process.exit(0));
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

client.on('messageCreate', message => {
  if (!message.author.bot) {
    calendar.processMessage(message).then((res) => {
      Logger.debug(res);
    }).catch((err) => {
      Logger.error('Message handler failed', { stack: err.stack });
    });
  }
});

client.on('messageReactionAdd', (reaction, user) => {
  if (!user.bot) {
    calendar.reactionAdded(reaction, user).then((res) => {
      Logger.debug(res);
    }).catch((err) => {
      Logger.error('Reaction-add handler failed', { stack: err.stack });
    });
  }
});

client.on('messageReactionRemove', (reaction, user) => {
  if (!user.bot) {
    calendar.reactionRemoved(reaction, user).then((res) => {
      Logger.debug(res);
    }).catch((err) => {
      Logger.error('Reaction-remove handler failed', { stack: err.stack });
    });
  }
});

client.on('interactionCreate', (interaction) => {
  calendar.handleInteraction(interaction).catch((err) => {
    Logger.error('Interaction handler failed', { stack: err.stack });
  });
});

client.login(Settings.get('/discord/token')).then((res) => {
  Logger.info('Connecting to discord');
}).catch((err) => {
  Logger.error('Discord login failed: ' + err.message);
  process.exit(1);
});
