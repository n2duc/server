import { NextFunction, Request, Response } from "express";
import { CatchAsyncError } from "../middleware/catchAsyncErrors";
import ErrorHandler from "../utils/ErrorHandler";
import cloudinary from "cloudinary";
import { createCourse, getAllCoursesService } from "../services/course.service";
import CourseModel from "../models/course.model";
import { redis } from "../utils/redis";
import mongoose from "mongoose";
import ejs from "ejs";
import path from "path";
import sendMail from "../utils/sendMail";
import NotificationModel from "../models/notification.model";

// upload course
export const uploadCourse = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = req.body;
        const thumbnail = data.thumbnail;
        if (thumbnail) {
            const myCloud = await cloudinary.v2.uploader.upload(thumbnail, {
                folder: "courses"
            });

            data.thumbnail = {
                public_id: myCloud.public_id,
                url: myCloud.secure_url
            }
        }

        createCourse(data, res, next);

    } catch (error: any) {
        return next(new ErrorHandler(error.message, 500));
    }
});

// edit course
export const editCourse = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = req.body;
        const thumbnail = data.thumbnail;

        if (thumbnail) {
            await cloudinary.v2.uploader.destroy(thumbnail.public_id);

            const myCloud = await cloudinary.v2.uploader.upload(thumbnail, {
                folder: "courses"
            });

            data.thumbnail = {
                public_id: myCloud.public_id,
                url: myCloud.secure_url
            }
        };

        const courseId = req.params.id;
        const course = await CourseModel.findByIdAndUpdate(courseId, 
            { $set: data },
            { new: true }
        );

        res.status(201).json({
            success: true,
            course,
        });

    } catch (error: any) {
        return next(new ErrorHandler(error.message, 500));
    }
});


// get single course without purchasing
export const getSingleCourse = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
    try {
        const courseId = req.params.id;

        const isCacheExists = await redis.get(courseId);

        if (isCacheExists) {
            const course = JSON.parse(isCacheExists);
            res.status(200).json({
                success: true,
                course,
            });
        } else {
            const course = await CourseModel.findById(req.params.id).select(
                "-courseData.videoUrl -courseData.suggestion -courseData.questions -courseData.links"
            );

            await redis.set(courseId, JSON.stringify(course), "EX", 604800);
    
            res.status(200).json({
                success: true,
                course,
            });
        }
        
    } catch (error: any) {
        return next(new ErrorHandler(error.message, 500));
    }
});

// get all courses without purchasing
export const getAllCourses = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
    try {
        const isCacheExists = await redis.get("allCourses");

        if (isCacheExists) {
            const courses = JSON.parse(isCacheExists);

            res.status(200).json({
                success: true,
                courses,
            });
        } else {
            const courses = await CourseModel.find().select(
                "-courseData.videoUrl -courseData.suggestion -courseData.questions -courseData.links"
            );

            await redis.set("allCourses", JSON.stringify(courses));

            res.status(200).json({
                success: true,
                courses,
            });
        }
    } catch (error: any) {
        return next(new ErrorHandler(error.message, 500));
    }
});


// get course content - only for valid user
export const getCourseByUser = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userCourseList = req.user?.courses;
        const courseId = req.params.id;

        const courseExists = userCourseList?.find((course: any) => course._id.toString() === courseId);

        console.log(courseId);

        if (!courseExists) {
            return next(new ErrorHandler("You are not authorized to access this course", 401));
        }

        const course = await CourseModel.findById(courseId);
        const content = course?.courseData;

        res.status(200).json({
            success: true,
            content,
        });

    } catch (error: any) {
        return next(new ErrorHandler(error.message, 500));
    }
});


// add question to course
interface IAddQuestionData {
    question: string;
    courseId: string;
    contentId: string;
}

export const addQuestion = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { question, courseId, contentId } = req.body as IAddQuestionData;
        const course = await CourseModel.findById(courseId);

        if (!mongoose.Types.ObjectId.isValid(contentId)) {
            return next(new ErrorHandler("Invalid content id", 400));
        }

        const courseContent = course?.courseData?.find((item: any) => item._id.equals(contentId));

        if (!courseContent) {
            return next(new ErrorHandler("Course content not found", 404));
        }

        // create new a question
        const newQuestion: any = {
            user: req.user,
            question,
            questionReplies: [],
        };

        // add question to course
        courseContent.questions.push(newQuestion);

        await NotificationModel.create({    
            userId: req.user?._id,
            title: "New Question Recived",
            message: `You have a new question in ${courseContent?.title}`,
        });

        await course?.save();

        res.status(200).json({
            success: true,
            course,
        });

    } catch (error: any) {
        return next(new ErrorHandler(error.message, 500));
    }
});


// add answer in course question
interface IAddAnswerData {
    answer: string;
    courseId: string;
    contentId: string;
    questionId: string;
}

export const addAnswer = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { answer, courseId, contentId, questionId } = req.body as IAddAnswerData;
        const course = await CourseModel.findById(courseId);

        if (!mongoose.Types.ObjectId.isValid(contentId)) {
            return next(new ErrorHandler("Invalid content id", 400));
        }

        const courseContent = course?.courseData?.find((item: any) => item._id.equals(contentId));

        if (!courseContent) {
            return next(new ErrorHandler("Course content not found", 404));
        }

        const question = courseContent?.questions?.find((item: any) => item._id.equals(questionId));
        if (!question) {
            return next(new ErrorHandler("Question not found", 404));
        }

        // create new a answer
        const newAnswer: any = {
            user: req.user,
            answer,
        };
        question.questionRepies?.push(newAnswer);

        await course?.save();

        if (req.user?._id.toString() !== question.user.toString()) {
            // send notification
            await NotificationModel.create({
                userId: req.user?._id,
                title: "New Question Reply Recived",
                message: `You have a new question reply in ${courseContent?.title}`,
            });
        } else {
            const data = {
                name: question.user.name,
                title: courseContent.title,
            };

            const html = await ejs.renderFile(path.join(__dirname, "../mails/question-reply.ejs"), data);
            try {
                await sendMail({
                    email: question.user.email,
                    subject: "Question reply",
                    template: "question-reply.ejs",
                    data,
                })
            } catch (error: any) {
                return new ErrorHandler(error.message, 500);
            }
        }

        res.status(200).json({
            success: true,
            course,
        })

    } catch (error: any) {
        return next(new ErrorHandler(error.message, 500));
    }
});


// add review to course
interface IAddReviewData {
    review: string;
    rating: number;
    userId: string;
}

export const addReview = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userCourseList = req.user?.courses;
        const courseId = req.params.id;

        const courseExists = userCourseList?.some((course: any) => course._id.toString() === courseId.toString());

        if (!courseExists) {
            return next(new ErrorHandler("You are not authorized to access this course", 401));
        }

        const course = await CourseModel.findById(courseId);
        const { review, rating } = req.body as IAddReviewData;

        const reviewData: any = {
            user: req.user,
            comment: review,
            rating
        }

        course?.reviews.push(reviewData);

        let avgRating = 0;
        course?.reviews.forEach((review: any) => {
            avgRating += review.rating;
        });

        if (course) {
            course.ratings = avgRating / course.reviews.length;
        }

        await course?.save();

        const notification = {
            title: "New Review Recived",
            message: `${req.user?.name} has give a review in ${course?.name}`,
        }
        // create notification

        res.status(200).json({
            success: true,
            course,
        });

    } catch (error: any) {
        return next(new ErrorHandler(error.message, 500));
    }
});

// add reply to review
interface IAddReplyReviewData {
    comment: string;
    courseId: string;
    reviewId: string;
}
export const addReplyToReview = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { comment, courseId, reviewId } = req.body as IAddReplyReviewData;
        const course = await CourseModel.findById(courseId);

        if (!course) {
            return next(new ErrorHandler("Course not found", 404));
        }

        const review = course?.reviews?.find((item: any) => item._id.toString() === reviewId);

        if (!review) {
            return next(new ErrorHandler("Review not found", 404));
        }

        const replyData: any = {
            user: req.user,
            comment,
        }

        if (!review.commentRepies) {
            review.commentRepies = [];
        }
        review.commentRepies?.push(replyData);

        await course?.save();

        res.status(200).json({
            success: true,
            course,
        });

    } catch (error: any) {
        return next(new ErrorHandler(error.message, 500));
    }
});


// get all courses -- only for admin
export const getAllCoursesAdmin = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
    try {
        getAllCoursesService(res)
    } catch (error: any) {
        return next(new ErrorHandler(error.message, 400));
    }
});

// delete course -- only for admin
export const deleteCourse = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const course = await CourseModel.findById(id);

        if (!course) {
            return next(new ErrorHandler("Course not found", 400));
        }

        await course.deleteOne({ id });
        await redis.del(id);

        res.status(200).json({
            success: true,
            message: "Course deleted successfully",
        });

    } catch (error: any) {
        return next(new ErrorHandler(error.message, 400));
    }
});