import { Document, Model, model, Types, Schema, Query } from "mongoose";

export interface User {
  userId: string;
  ipAddress?: string;
}

interface UserBaseDocument extends User, Document {}

export interface UserModel extends Model<UserBaseDocument> {}

const UserSchema = new Schema<UserBaseDocument, UserModel>({
  userId: {
    type: String,
    required: true,
  },
  ipAddress: {
    type: String,
    required: false,
  },
});

export default model<UserBaseDocument, UserModel>("User", UserSchema);
