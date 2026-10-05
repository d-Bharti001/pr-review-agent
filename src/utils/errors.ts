export class BadRequestError extends Error {
    statusCode: number;

    constructor(message: string) {
        super(message);
        this.name = "BadRequestError";
        this.statusCode = 400;
        Object.setPrototypeOf(this, BadRequestError.prototype);
    }
}

export class UnauthorizedError extends Error {
    statusCode: number;

    constructor(message: string) {
        super(message);
        this.name = "UnauthorizedError";
        this.statusCode = 401;
        Object.setPrototypeOf(this, UnauthorizedError.prototype);
    }
}

export class NotFoundError extends Error {
    statusCode: number;

    constructor(message: string) {
        super(message);
        this.name = "NotFoundError";
        this.statusCode = 404;
        Object.setPrototypeOf(this, NotFoundError.prototype);
    }
}

export class ConflictError extends Error {
    statusCode: number;

    constructor(message: string) {
        super(message);
        this.name = "ConflictError";
        this.statusCode = 409;
        Object.setPrototypeOf(this, ConflictError.prototype);
    }
}

export class InternalServerError extends Error {
    statusCode: number;

    constructor(message: string) {
        super(message);
        this.name = "InternalServerError";
        this.statusCode = 500;
        Object.setPrototypeOf(this, InternalServerError.prototype);
    }
}

export function isErrorDueToClient(err: Error) {
    return (
        err instanceof BadRequestError ||
        err instanceof UnauthorizedError ||
        err instanceof NotFoundError ||
        err instanceof ConflictError
    );
}
