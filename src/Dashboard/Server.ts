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
import cookieParser from 'cookie-parser';
import * as http from 'http';
import Auth from './Auth';
import Logger from '../Bot/Logger';
import Settings from '../settings';

const REQUEST_TIMEOUT_MS = 30_000;

/**
 * The dashboard's HTTP shell: hardening, login, cookie auth. Views and
 * actions register their routes through registerRoutes(); start() seals
 * the app with the 404 and error handlers.
 */
export default class DashboardServer {
  /**
   * Fail closed: without a port, a strong token, and a configured owner
   * there is no dashboard — and `docker-compose up` stays zero-config.
   */
  public static shouldStart(): boolean {
    return Boolean(Settings.get('/dashboard/port')
      && Settings.get('/dashboard/token')
      && Settings.get('/discord/ownerId'));
  }

  private app: express.Express;
  private server: http.Server | null;
  private auth: Auth;
  private secure: boolean;
  private cookieName: string;

  constructor() {
    this.auth = new Auth(Settings.get('/dashboard/token'));
    // Secure cookies are the default; switch off only for tier-1
    // trusted-LAN plain-HTTP setups (documented in the README)
    this.secure = Settings.get('/dashboard/secureCookies') !== 'false';
    this.cookieName = this.secure ? '__Host-calbot' : 'calbot';
    this.server = null;
    this.app = express();
    this.configure();
  }

  public registerRoutes(register: (app: express.Express) => void) {
    register(this.app);
  }

  public start() {
    // Registered after all routes so thrown/rejected handlers land here
    // (express 5 forwards async rejections natively)
    this.app.use((req: express.Request, res: express.Response) => {
      res.status(404).send('Not found');
    });
    this.app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
      Logger.error('Dashboard request failed', { path: req.path, stack: err.stack });
      res.status(500).send('Something went wrong');
    });

    const port = parseInt(Settings.get('/dashboard/port'), 10);
    const bind = Settings.get('/dashboard/bind') || '0.0.0.0';

    this.server = this.app.listen(port, bind);
    this.server.requestTimeout = REQUEST_TIMEOUT_MS;

    // EADDRINUSE arrives asynchronously; unhandled it would take the
    // whole process — and the Discord client — down with it
    this.server.on('error', (err) => {
      Logger.error('Dashboard server error (bot keeps running): ' + err.message);
    });
    this.server.on('listening', () => {
      Logger.info('Dashboard listening on ' + bind + ':' + port);
    });
  }

  public async stop() {
    const server = this.server;
    if (server === null) {
      return;
    }
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections();
    });
  }

  private configure() {
    this.app.disable('x-powered-by');

    this.app.use((req, res, next) => {
      res.set('Content-Security-Policy', 'default-src \'self\'');
      res.set('X-Content-Type-Options', 'nosniff');
      res.set('X-Frame-Options', 'DENY');
      next();
    });

    this.app.use(express.urlencoded({ extended: false, limit: '10kb' }));
    this.app.use(cookieParser());

    // CSRF: SameSite=Strict cookies + no GET mutations + this check.
    // Browsers send Sec-Fetch-Site on every request; anything cross-site
    // has no business POSTing here
    this.app.use((req, res, next) => {
      if (req.method === 'POST') {
        const site = req.get('sec-fetch-site');
        if (site !== undefined && site !== 'same-origin' && site !== 'none') {
          res.status(403).send('Cross-site request rejected');
          return;
        }
      }
      next();
    });

    this.app.get('/login', (req, res) => {
      res.send(DashboardServer.loginPage(false));
    });

    this.app.post('/login', (req, res) => {
      if (!this.auth.registerAttempt(req.ip ?? 'unknown')) {
        Logger.error('Dashboard login throttled', { ip: req.ip });
        res.status(429).send('Too many attempts — try again later');
        return;
      }

      const token = req.body !== undefined ? req.body.token : undefined;
      if (!this.auth.verifyToken(token)) {
        Logger.error('Dashboard login failed', { ip: req.ip });
        res.status(401).send(DashboardServer.loginPage(true));
        return;
      }

      res.cookie(this.cookieName, this.auth.cookieValue(), {
        httpOnly: true,
        sameSite: 'strict',
        secure: this.secure,
        path: '/',
      });
      res.redirect('/');
    });

    // Everything below requires the cookie
    this.app.use((req, res, next) => {
      if (this.auth.verifyCookie(req.cookies[this.cookieName])) {
        next();
        return;
      }
      res.redirect('/login');
    });
  }

  // Static markup, no interpolation of user input — safe as a literal
  private static loginPage(failed: boolean): string {
    return '<!doctype html><html><head><meta charset="utf-8">'
      + '<meta name="viewport" content="width=device-width, initial-scale=1">'
      + '<title>Calendar bot</title></head><body style="font-family:sans-serif;max-width:20rem;margin:4rem auto">'
      + '<h1>Calendar bot</h1>'
      + (failed ? '<p style="color:#b00">Wrong token.</p>' : '')
      + '<form method="post" action="/login">'
      + '<input type="password" name="token" placeholder="Admin token" autofocus style="width:100%;padding:.5rem">'
      + '<button type="submit" style="margin-top:.5rem;padding:.5rem 1rem">Sign in</button>'
      + '</form></body></html>';
  }
}
