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

import { prop, getModelForClass } from '@typegoose/typegoose';
import mongoose from '../../Entities/Mongoose';

class Guild {
  _id?: mongoose.Types.ObjectId;

  @prop({index: true})
  public guildId?: string;

  @prop()
  public allowEventCreation?: mongoose.Types.Map<string>;

  @prop({ default: true })
  public allowIndividualTimeZone?: boolean;

  @prop({ default: 'Europe/London' })
  public defaultTimeZone?: string;

  @prop()
  public active?: boolean;
}

const ServerModel = getModelForClass(Guild, { existingMongoose: mongoose, schemaOptions: { timestamps: true } });

/*
ServerModel.getUserByUserAndGuildId = async (userId: string, guildId) => {
  const res = await ServerModel.findOne({ userId, guildId });
  if (res) {
    return res;
  } else {
    return null;
  }
}*/

export { Guild, ServerModel }
