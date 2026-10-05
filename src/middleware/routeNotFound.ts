import type { Request, Response, NextFunction } from "express";
import { NotFoundError } from "src/utils/errors";

export function routeNotFoundHandler(_req: Request, _res: Response, next: NextFunction) {
    return next(new NotFoundError("Route not found"));
}
