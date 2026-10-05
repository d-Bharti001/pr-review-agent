import { TEST } from "src/config";

const colors = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    dim: "\x1b[2m",
    underscore: "\x1b[4m",
    blink: "\x1b[5m",
    reverse: "\x1b[7m",
    hidden: "\x1b[8m",

    fg: {
        black: "\x1b[30m",
        red: "\x1b[31m",
        green: "\x1b[32m",
        yellow: "\x1b[33m",
        blue: "\x1b[34m",
        magenta: "\x1b[35m",
        cyan: "\x1b[36m",
        white: "\x1b[37m",
        crimson: "\x1b[38m",
    },
    bg: {
        black: "\x1b[40m",
        red: "\x1b[41m",
        green: "\x1b[42m",
        yellow: "\x1b[43m",
        blue: "\x1b[44m",
        magenta: "\x1b[45m",
        cyan: "\x1b[46m",
        white: "\x1b[47m",
        crimson: "\x1b[48m",
    },
};

export function getCallingFunction(error: Error) {
    try {
        const stack = error.stack;

        if (stack === undefined) return "--";

        const line = stack.split("\n")[2];
        const regex = /^.*at\s([a-zA-Z]+).*$/;
        const groups = line.match(regex);

        if (groups === null) return "--";

        if (groups.length < 2) return "--";

        return groups[1];
    } catch {
        return "--";
    }
}

export function log(message?: any, ...optionalParams: any[]) {
    if (!TEST)
        console.log(
            `[${new Date().toLocaleString()}]`,
            colors.fg.magenta,
            "[SERVER-LOG] ",
            colors.reset,
            message,
            ...optionalParams,
        );
}

export function info(message?: any, ...optionalParams: any[]) {
    if (!TEST)
        console.info(
            `[${new Date().toLocaleString()}]`,
            colors.fg.cyan,
            "[INFO]",
            colors.reset,
            colors.bg.green,
            `[${getCallingFunction(new Error())}]`,
            colors.reset,
            message,
            ...optionalParams,
        );
}

export function warn(message?: any, ...optionalParams: any[]) {
    if (!TEST)
        console.warn(
            `[${new Date().toLocaleString()}]`,
            colors.fg.yellow,
            "[WARN]",
            colors.reset,
            colors.bg.green,
            `[${getCallingFunction(new Error())}]`,
            colors.reset,
            message,
            ...optionalParams,
        );
}

export function error(message?: any, ...optionalParams: any[]) {
    if (!TEST)
        console.error(
            `[${new Date().toLocaleString()}]`,
            colors.fg.red,
            "[ERROR]",
            colors.reset,
            colors.bg.green,
            `[${getCallingFunction(new Error())}]`,
            colors.reset,
            message,
            ...optionalParams,
        );
}

const logger = {
    log,
    info,
    warn,
    error,
    warning: warn,
    getCallingFunction,
};

/** Create the global definition */
declare global {
    var logger: {
        log: (message?: any, ...optionalParams: any[]) => void;
        info: (message?: any, ...optionalParams: any[]) => void;
        warn: (message?: any, ...optionalParams: any[]) => void;
        warning: (message?: any, ...optionalParams: any[]) => void;
        error: (message?: any, ...optionalParams: any[]) => void;
        getCallingFunction: (error: Error) => string;
    };
}

/** Link the local and global variable */
globalThis.logger = logger;

export default logger;
