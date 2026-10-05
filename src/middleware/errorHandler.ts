import type { Request, Response, NextFunction } from "express";

import { isErrorDueToClient } from "src/utils/errors";

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction) {
    logger.error(`Error [${req.method}] ${req.originalUrl} ::: ${err.stack}`);

    let statusCode = 500;
    let message = "something went wrong";

    if (isErrorDueToClient(err)) {
        statusCode = err.statusCode;
        message = err.message;
    }

    return res.status(statusCode).json({ error: message });
}
