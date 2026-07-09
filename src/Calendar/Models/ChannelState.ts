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

enum ChannelStateKind {
  detached = 'detached',
  quarantined = 'quarantined',
}

/**
 * A channel the bot no longer operates in: 'detached' by deliberate
 * owner action, 'quarantined' automatically when the channel turned out
 * to be deleted. Presence of a record blocks event creation there.
 */
class ChannelState {
  @prop({ unique: true })
  public channelId: string;

  @prop({ index: true })
  public guildId?: string;

  @prop({ enum: ChannelStateKind })
  public state: ChannelStateKind;

  public static async getAll(this: ReturnModelType<typeof ChannelState>) {
    return this.find({});
  }
}

const ChannelStateModel = getModelForClass(ChannelState, { existingMongoose: mongoose, schemaOptions: { timestamps: true } });

export { ChannelState, ChannelStateModel, ChannelStateKind };
