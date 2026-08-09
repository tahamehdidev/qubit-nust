import { asyncHandler } from "../utils/asyncHandler.js";
import { userService } from "../services/user.service.js";

export const listUsersController = asyncHandler(async (req, res) => {
  const page = req.query.page ? Number(req.query.page) : 1;
  const limit = req.query.limit ? Number(req.query.limit) : 20;
  const result = await userService.list({
    search: req.query.search,
    role: req.query.role,
    page,
    limit,
  });
  res.status(200).json(result);
});

export const createInstructorController = asyncHandler(async (req, res) => {
  const result = await userService.createInstructor(req.validatedBody, req.user.id);
  res.status(201).json(result);
});

export const deactivateUserController = asyncHandler(async (req, res) => {
  const user = await userService.deactivateUser(req.params.userId, req.user.id);
  res.status(200).json({ user });
});
