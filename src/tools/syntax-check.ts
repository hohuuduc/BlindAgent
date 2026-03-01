// src/tools/syntax-check.ts
// AST-based syntax validation tool for TypeScript/JavaScript files.

import { z } from 'zod';
import { Tool, ToolResult } from './registry';

/**
 * Quick syntax check by attempting to parse the code.
 * Uses TypeScript compiler API via dynamic import of ts-morph.
 */
export const syntaxCheckTool: Tool = {
    name: 'syntax_check',
    description: 'Check TypeScript/JavaScript syntax validity',
    schema: z.object({
        code: z.string(),
        filename: z.string().optional(),
    }),
    execute: async (params): Promise<ToolResult> => {
        try {
            const { Project, ScriptKind } = await import('ts-morph');
            const project = new Project({ useInMemoryFileSystem: true });

            const filename = params.filename ?? 'check.ts';
            const sourceFile = project.createSourceFile(filename, params.code);
            const diagnostics = sourceFile.getPreEmitDiagnostics();

            const errors = diagnostics
                .filter(d => d.getCategory() === 0) // DiagnosticCategory.Error = 0
                .map(d => ({
                    line: d.getLineNumber(),
                    message: d.getMessageText().toString(),
                }));

            return {
                success: true,
                output: {
                    valid: errors.length === 0,
                    errors,
                    errorCount: errors.length,
                },
            };
        } catch (err: any) {
            return { success: false, output: null, error: err.message };
        }
    },
};

export function createSyntaxTools(): Tool[] {
    return [syntaxCheckTool];
}
