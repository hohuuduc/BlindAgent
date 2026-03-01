// src/utils/logger.ts
// Simple structured logger for the agent framework.

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};

let minLevel: LogLevel = 'info';

export function setLogLevel(level: LogLevel): void {
    minLevel = level;
}

function shouldLog(level: LogLevel): boolean {
    return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[minLevel];
}

function formatTimestamp(): string {
    return new Date().toISOString().slice(11, 23);
}

export function log(level: LogLevel, context: string, message: string, data?: any): void {
    if (!shouldLog(level)) return;

    const prefix = `[${formatTimestamp()}] [${level.toUpperCase().padEnd(5)}] [${context}]`;
    const line = `${prefix} ${message}`;

    if (level === 'error') {
        console.error(line, data ?? '');
    } else if (level === 'warn') {
        console.warn(line, data ?? '');
    } else {
        console.log(line, data ?? '');
    }
}

export const logger = {
    debug: (ctx: string, msg: string, data?: any) => log('debug', ctx, msg, data),
    info: (ctx: string, msg: string, data?: any) => log('info', ctx, msg, data),
    warn: (ctx: string, msg: string, data?: any) => log('warn', ctx, msg, data),
    error: (ctx: string, msg: string, data?: any) => log('error', ctx, msg, data),
};
