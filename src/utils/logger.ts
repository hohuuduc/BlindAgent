// src/utils/logger.ts
// Structured logger with console + file output.
// Logs are written to log/agent-YYYY-MM-DD.log

import * as fs from 'fs';
import * as path from 'path';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};

let minLevel: LogLevel = 'info';
let logDir: string = path.join(process.cwd(), 'log');
let logDirReady = false;

export function setLogLevel(level: LogLevel): void {
    minLevel = level;
}

export function setLogDir(dir: string): void {
    logDir = dir;
    logDirReady = false;
}

function shouldLog(level: LogLevel): boolean {
    return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[minLevel];
}

function formatTimestamp(): string {
    return new Date().toISOString().slice(11, 23);
}

function formatDate(): string {
    return new Date().toISOString().slice(0, 10);
}

/**
 * Ensure the log directory exists (lazy-init on first write).
 */
function ensureLogDir(): void {
    if (logDirReady) return;
    try {
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
        logDirReady = true;
    } catch {
        // Silently fail — file logging is best-effort
    }
}

/**
 * Get the current log file path: log/agent-YYYY-MM-DD.log
 */
function getLogFilePath(): string {
    return path.join(logDir, `agent-${formatDate()}.log`);
}

/**
 * Append a line to the log file (best-effort, never throws).
 */
function appendToFile(line: string): void {
    try {
        ensureLogDir();
        fs.appendFileSync(getLogFilePath(), line + '\n', 'utf-8');
    } catch {
        // Silently fail — don't crash the app for logging
    }
}

export function log(level: LogLevel, context: string, message: string, data?: any): void {
    if (!shouldLog(level)) return;

    const prefix = `[${formatTimestamp()}] [${level.toUpperCase().padEnd(5)}] [${context}]`;
    const line = `${prefix} ${message}`;

    // Console output
    if (level === 'error') {
        console.error(line, data ?? '');
    } else if (level === 'warn') {
        console.warn(line, data ?? '');
    } else {
        console.log(line, data ?? '');
    }

    // File output
    const fileLine = data !== undefined
        ? `${line} ${typeof data === 'string' ? data : JSON.stringify(data, null, 2)}`
        : line;
    appendToFile(fileLine);
}

/**
 * Write a detailed block of data to the log file only (not console).
 * Used for large payloads like LLM prompts, responses, and tool results.
 */
export function logBlock(context: string, title: string, content: string): void {
    const timestamp = formatTimestamp();
    const separator = '─'.repeat(60);
    const block = [
        `[${timestamp}] [DETAIL] [${context}] ${separator}`,
        `  ${title}`,
        `${separator}`,
        content,
        `${separator}`,
        '',
    ].join('\n');

    appendToFile(block);
}

export const logger = {
    debug: (ctx: string, msg: string, data?: any) => log('debug', ctx, msg, data),
    info: (ctx: string, msg: string, data?: any) => log('info', ctx, msg, data),
    warn: (ctx: string, msg: string, data?: any) => log('warn', ctx, msg, data),
    error: (ctx: string, msg: string, data?: any) => log('error', ctx, msg, data),
    /** Write a detailed block to the log file only (not console) */
    block: (ctx: string, title: string, content: string) => logBlock(ctx, title, content),
};
