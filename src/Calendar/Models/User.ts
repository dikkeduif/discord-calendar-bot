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

class User {
  _id?: mongoose.Types.ObjectId;

  @prop({index: true})
  public userId?: string;

  @prop({index: true})
  public guildId?: string;

  @prop()
  public userTimeZone?: string;

  @prop()
  public eventTimeZone?: string;

  @prop()
  public active?: boolean;

  public static async getUserByUserAndGuildId(this: ReturnModelType<typeof User>, userId: string, guildId: string) {
    const res = await this.findOne({ userId, guildId });
    if (res) {
      return res;
    } else {
      return null;
    }
  }
}

const UserModel = getModelForClass(User, { existingMongoose: mongoose, schemaOptions: { timestamps: true } });

export { User, UserModel }
