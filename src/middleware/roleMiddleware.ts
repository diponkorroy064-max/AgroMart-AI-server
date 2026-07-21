import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../types/express";

export const roleMiddleware =
  (...roles: string[]) =>
    (
      req: AuthenticatedRequest,
      res: Response,
      next: NextFunction
    ) => {
      if (!req.user) {
        return res.status(401).json({
          message: "Unauthorized",
        });
      }

      if (!roles.includes(req.user.role)) {
        return res.status(403).json({
          message: "Forbidden",
        });
      }

      next();
    };
