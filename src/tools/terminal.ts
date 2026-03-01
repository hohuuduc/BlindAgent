// src/tools/terminal.ts
// Sandbox executor for running terminal commands safely.
// Uses execa with whitelist, blacklist, timeout, and output capping.

import { z } from 'zod';
import { Tool, ToolResult } from './registry';

// Use dynamic import for execa (ESM compatibility)
let execaFn: any = null;
async function getExeca() {
    if (!execaFn) {
        const mod = require('execa');
        execaFn = mod.execa ?? mod.default?.execa ?? mod;
    }
    return execaFn;
}

export interface SandboxConfig {
    cwd: string;
    timeout: number;
    maxOutputBytes: number;
    allowedCommands: string[];
    blockedPatterns: RegExp[];
}

const DEFAULT_SANDBOX: SandboxConfig = {
    cwd: process.cwd(),
    timeout: 30_000,
    maxOutputBytes: 50_000,
    allowedCommands: [
        'node', 'npx', 'npm', 'pnpm',
        'tsc', 'eslint', 'prettier',
        'git',
        'cat', 'ls', 'dir', 'find', 'grep', 'type',
    ],
    blockedPatterns: [
        /rm\s+(-rf?|--recursive)/i,
        /del\s+\/s/i,
        /curl.*\|.*sh/i,
        /sudo/i,
        /mkfs|fdisk|dd\s/i,
    ],
};

function truncateOutput(output: string, max: number): string {
    if (output.length <= max) return output;
    const half = Math.floor(max / 2);
    return output.slice(0, half) + `\n...[truncated ${output.length - max} bytes]...\n` + output.slice(-half);
}

export const runCommandTool: Tool = {
    name: 'run_command',
    description: 'Run a terminal command in sandbox',
    schema: z.object({
        command: z.string(),
        args: z.array(z.string()).default([]),
        timeout: z.number().optional(),
    }),
    execute: async (params): Promise<ToolResult> => {
        const config = { ...DEFAULT_SANDBOX, cwd: process.cwd() };

        // Safety check: command whitelist
        if (!config.allowedCommands.includes(params.command)) {
            return {
                success: false,
                output: null,
                error: `Command "${params.command}" not in allowlist: [${config.allowedCommands.join(', ')}]`,
            };
        }

        // Safety check: blocked patterns
        const fullCmd = `${params.command} ${params.args.join(' ')}`;
        for (const pattern of config.blockedPatterns) {
            if (pattern.test(fullCmd)) {
                return {
                    success: false,
                    output: null,
                    error: `Command matches blocked pattern`,
                };
            }
        }

        try {
            const execa = await getExeca();
            const result = await execa(params.command, params.args, {
                cwd: config.cwd,
                timeout: params.timeout ?? config.timeout,
                reject: false,
                env: { ...process.env, CI: 'true', NODE_ENV: 'development' },
            });

            const stdout = truncateOutput(result.stdout ?? '', config.maxOutputBytes);
            const stderr = truncateOutput(result.stderr ?? '', config.maxOutputBytes);

            return {
                success: result.exitCode === 0,
                output: {
                    exitCode: result.exitCode,
                    stdout,
                    stderr,
                    timedOut: result.timedOut ?? false,
                },
                error: result.exitCode !== 0 ? stderr || 'Non-zero exit code' : undefined,
            };
        } catch (err: any) {
            return { success: false, output: null, error: err.message };
        }
    },
};

export function createTerminalTools(): Tool[] {
    return [runCommandTool];
}
