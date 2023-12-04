import { Request, Response, NextFunction } from "express";
import ErrorHandler from "../utils/ErrorHandler";
import { CatchAsyncError } from "../middleware/catchAsyncErrors";
import UserModel from "../models/user.model";
import { generateLast12MonthsData } from "../utils/analytics.generator";
import CourseModel from "../models/course.model";
import OrderModel from "../models/order.model";

// get user analytics -- admin
export const getUsersAnalytics = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
    try {
        const users = await generateLast12MonthsData(UserModel);

        res.status(200).json({
            success: true,
            users,
        });
    } catch (error: any) {
        return next(new ErrorHandler(error.message, 500));
    }
});

// get courses analytics -- admin
export const getCoursesAnalytics = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
    try {
        const course = await generateLast12MonthsData(CourseModel);

        res.status(200).json({
            success: true,
            course,
        });
    } catch (error: any) {
        return next(new ErrorHandler(error.message, 500));
    }
});

// get orders analytics -- admin
export const getOrdersAnalytics = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
    try {
        const orders = await generateLast12MonthsData(OrderModel);

        res.status(200).json({
            success: true,
            orders,
        });
    } catch (error: any) {
        return next(new ErrorHandler(error.message, 500));
    }
});