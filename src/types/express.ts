import { Request } from "express";
import { IUser } from "../models/User";

export interface AuthenticatedRequest extends Request {
    user?: IUser;
}
