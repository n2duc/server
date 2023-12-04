import express from "express";
import { Request } from "express";
import { IUser } from "../models/user.model";

declare global {
    namespace Express {
        interface Request {
            user?: IUser
        }
    }
}