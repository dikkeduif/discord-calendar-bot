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

import { prop, getModelForClass, ReturnModelType } from '@typegoose/typegoose';
import mongoose from '../../Entities/Mongoose';

enum OptionsType {
  custom = 'custom',
  default = 'default',
  none = 'none'
}

class Event {
  _id?: mongoose.Types.ObjectId;

  @prop()
  public shortId: string;

  @prop()
  public title?: string;

  @prop()
  public description?: string;

  @prop()
  public active?: boolean;

  @prop({index: true})
  public authorId?: string;

  @prop()
  public authorName?: string;

  @prop({index: true})
  public messageId?: string;

  @prop()
  public channelId?: string;

  @prop()
  public guildId?: string;

  @prop()
  public eventDate?: Date;

  @prop()
  public eventTimeZone?: string;

  @prop()
  public userTimeZone?: string;

  @prop()
  public status?: number;

  @prop()
  public sessionType?: string;

  @prop()
  public reminder?: number;

  @prop()
  public reminderSent?: boolean;

  @prop({type: String })
  public options?: Map<string, string>

  @prop({type: String })
  public registrations?: Map<string, string>

  @prop({ enum: OptionsType })
  public optionsType: OptionsType

  @prop()
  public declineOption: string;

  public setDefaultOptions() {
    this.options = new Map<string, string>();
    this.options.set('✅', 'Yes');
    this.options.set('❎', 'No');
    this.options.set('❔', 'Maybe');
  }

  public setDefaultDecline() {
    this.declineOption = '❎';
    this.setOption('❎', 'N/A');
  }

  public getDefaultDecline() {
    return '❎';
  }

  public setOption(key, value) {
    if (this.options === undefined) {
      this.options = new Map<string, string>();
    }
    this.options.set(key, value);
  }

  public clearOptions() {
    if (this.options === undefined) {
      this.options = new Map<string, string>();
    }
    this.options.clear();
  }

  public hasOptions(): boolean {
    if (this.options === undefined) {
      return false;
    } else {
      return this.options.size > 0;
    }
  }

  public static async getByMessageId(this: ReturnModelType<typeof Event>, messageId: string) {
    const res = await this.findOne({ messageId });
    if (res) {
      return res;
    } else {
      return null;
    }
  }

  public static async getByShortId(this: ReturnModelType<typeof Event>, shortId: string, authorId: string) {
    const res = await this.findOne({ shortId, authorId, active: true });
    if (res) {
      return res;
    } else {
      return null;
    }
  }

  public static async getForReminders(this: ReturnModelType<typeof Event>) {
    const res = this.find({reminderSent: null, eventDate: { '$gte': new Date() }, active: true }).limit(10);
    if (res) {
      return res;
    } else {
      return null;
    }
  }


  public static async getUserEvents(this: ReturnModelType<typeof Event>, authorId: string) {
    const res = await this.find({authorId, eventDate: { '$gte': new Date() }, active: true}).limit(5).sort({eventDate: -1});
    if (res) {
      return res;
    } else {
      return null;
    }
  }
}
const EventModel = getModelForClass(Event, { existingMongoose: mongoose, schemaOptions: { timestamps: true } });

export { Event, EventModel, OptionsType }
