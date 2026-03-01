// src/tools/file-ops.ts
// File operation tools: read_file, write_file, search_files.

import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
import { Tool, ToolResult } from './registry';

export const readFileTool: Tool = {
    name: 'read_file',
    description: 'Read the contents of a file',
    schema: z.object({
        path: z.string(),
    }),
    execute: async (params): Promise<ToolResult> => {
        try {
            const content = fs.readFileSync(params.path, 'utf-8');
            const lines = content.split('\n');
            return {
                success: true,
                output: {
                    path: params.path,
                    content,
                    lineCount: lines.length,
                },
            };
        } catch (err: any) {
            return { success: false, output: null, error: err.message };
        }
    },
};

export const writeFileTool: Tool = {
    name: 'write_file',
    description: 'Write content to a file (creates parent directories)',
    schema: z.object({
        path: z.string(),
        content: z.string(),
    }),
    execute: async (params): Promise<ToolResult> => {
        try {
            const dir = path.dirname(params.path);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(params.path, params.content, 'utf-8');
            const lineCount = params.content.split('\n').length;
            return {
                success: true,
                output: { path: params.path, lineCount },
            };
        } catch (err: any) {
            return { success: false, output: null, error: err.message };
        }
    },
};

export const searchFilesTool: Tool = {
    name: 'search_files',
    description: 'Search for files matching a glob pattern in a directory',
    schema: z.object({
        directory: z.string(),
        pattern: z.string().optional(),
        extensions: z.array(z.string()).optional(),
    }),
    execute: async (params): Promise<ToolResult> => {
        try {
            const dir = params.directory;
            if (!fs.existsSync(dir)) {
                return { success: false, output: null, error: `Directory not found: ${dir}` };
            }

            const files = walkDir(dir)
                .filter(f => {
                    if (params.extensions?.length) {
                        const ext = path.extname(f).slice(1);
                        return params.extensions.includes(ext);
                    }
                    return true;
                })
                .filter(f => {
                    if (params.pattern) {
                        return f.includes(params.pattern);
                    }
                    return true;
                });

            return {
                success: true,
                output: { files, count: files.length },
            };
        } catch (err: any) {
            return { success: false, output: null, error: err.message };
        }
    },
};

/** Recursively walk a directory and return all file paths (relative). */
function walkDir(dir: string, base?: string): string[] {
    const result: string[] = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
        const rel = base ? path.join(base, entry.name) : entry.name;
        const full = path.join(dir, entry.name);

        if (entry.name === 'node_modules' || entry.name === '.git') continue;

        if (entry.isDirectory()) {
            result.push(...walkDir(full, rel));
        } else {
            result.push(rel);
        }
    }

    return result;
}

/** Create the default set of file tools. */
export function createFileTools(): Tool[] {
    return [readFileTool, writeFileTool, searchFilesTool];
}
