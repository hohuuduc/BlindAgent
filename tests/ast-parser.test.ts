import { describe, it, expect } from 'vitest';
import path from 'path';
import fs from 'fs';
import { extractFunctions, chunkForContext, renderAnnotatedCode } from '../src/tools/ast-parser';

describe('AST Parser & Code Chunking Module', () => {
    const fixturePath = path.join(__dirname, 'fixtures', 'sample-code.ts');

    it('1. Extract single function -> level 1', () => {
        const chunk = chunkForContext(fixturePath, 'findUser', 200);
        expect(chunk.level).toBe(1);
        expect(chunk.code).toContain('findUser');
        expect(chunk.code).toContain('return {');
    });

    it('2. Extract class method -> level 1 with type/imports', () => {
        const chunk = chunkForContext(fixturePath, 'AuthService.register', 200);
        expect(chunk.level).toBe(1);
        expect(chunk.code).toContain('register(');
        expect(chunk.code).toContain('this.users.some');
    });

    it('3. Function > budget -> fallback level 2 (block split)', () => {
        const chunk = chunkForContext(fixturePath, 'largeMonolith', 70);
        // Usually large chunk would hit L2. Let's verify it gets L2.
        // If it fails we adjust the budget.
        expect(chunk.level).toBe(2);
        expect(chunk.code).toContain('largeMonolith');
        expect(chunk.code).toContain('/* ... */');
    });

    it('4. Monolith function -> fallback level 3 (signature only)', () => {
        const chunk = chunkForContext(fixturePath, 'largeMonolith', 30);
        // Budget 30 is enough for signature + empty body, but not enough for any first statements
        expect(chunk.level).toBe(3);
        // But wait, chunkForContext level 3 code might just be signature + /* ... */
        expect(chunk.code).toContain('largeMonolith');
        expect(chunk.code).toContain('/* ... */');
        expect(chunk.code).not.toContain('let counter');
    });

    it('5. renderAnnotatedCode formatting matches specification', () => {
        const code = "function t() {\\n  return;\\n}";
        const output = renderAnnotatedCode("test.ts", code, 5);
        expect(output).toContain("--- test.ts:5-7 ---");
        expect(output).toContain("  5 | function t() {");
        expect(output).toContain("  6 |   return;");
        expect(output).toContain("  7 | }");
    });

    it('6. extractFunctions lists all functions and signatures', () => {
        const funcs = extractFunctions(fixturePath);
        expect(funcs.length).toBeGreaterThan(0);
        const names = funcs.map(f => f.name);
        expect(names).toContain('findUser');
        expect(names).toContain('login');
        expect(names).toContain('AuthService.register');
        expect(names).toContain('largeMonolith');

        // Check signature
        const lu = funcs.find(f => f.name === 'largeMonolith');
        expect(lu?.signature).toContain("export function largeMonolith(): void");
    });

    it('7. File not exists throws error', () => {
        expect(() => extractFunctions('not-exist.ts')).toThrow();
    });

    it('8. File not TS/JS triggers graceful handling', () => {
        const txtPath = path.join(__dirname, 'fixtures', 'empty.txt');
        fs.writeFileSync(txtPath, 'Hello world text only, no code here.');
        const funcs = extractFunctions(txtPath);
        expect(funcs).toEqual([]); // gracefully empty, doesn't throw parser exception
        if (fs.existsSync(txtPath)) fs.unlinkSync(txtPath);
    });
});
