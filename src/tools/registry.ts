// src/tools/registry.ts
// Tool registry — maps tool names to handler functions.
// Each tool receives params and returns a result object.

import { z, ZodSchema } from 'zod';

export interface ToolResult {
    success: boolean;
    output: any;
    error?: string;
}

export interface Tool {
    name: string;
    description: string;
    schema: ZodSchema;
    execute: (params: any) => Promise<ToolResult>;
}

export class ToolRegistry {
    private tools = new Map<string, Tool>();

    /** Register a tool. */
    register(tool: Tool): void {
        this.tools.set(tool.name, tool);
    }

    /** Get a tool by name. */
    get(name: string): Tool | null {
        return this.tools.get(name) ?? null;
    }

    /** Check if a tool is registered. */
    has(name: string): boolean {
        return this.tools.has(name);
    }

    /** List all tool names. */
    listNames(): string[] {
        return Array.from(this.tools.keys());
    }

    /** Execute a tool by name with given params. */
    async execute(name: string, params: any): Promise<ToolResult> {
        const tool = this.tools.get(name);
        if (!tool) {
            return { success: false, output: null, error: `Tool not found: ${name}` };
        }

        try {
            // Validate params against schema
            const validated = tool.schema.parse(params);
            return await tool.execute(validated);
        } catch (err: any) {
            return { success: false, output: null, error: err.message };
        }
    }
}
