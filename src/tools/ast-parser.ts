import { Project, FunctionDeclaration, MethodDeclaration, SyntaxKind } from 'ts-morph';
import { countTokens } from '../utils/token-counter';

export interface ChunkResult {
    level: number;
    code: string;
    startLine: number;
    endLine: number;
}

export interface FunctionInfo {
    name: string;
    signature: string;
    startLine: number;
    endLine: number;
}

export interface ImportInfo {
    text: string;
    startLine: number;
    endLine: number;
}

const project = new Project();

export function extractFunctions(filePath: string): FunctionInfo[] {
    const sourceFile = project.addSourceFileAtPath(filePath);
    const results: FunctionInfo[] = [];

    sourceFile.getFunctions().forEach(f => {
        const jsdocs = f.getJsDocs().map(doc => doc.getText()).join('\\n');
        const name = f.getName() || 'anonymous';
        const text = f.getText();
        const braceIdx = text.indexOf('{');
        const sigText = braceIdx !== -1 ? text.substring(0, braceIdx).trim() : text.trim();
        results.push({
            name,
            signature: sigText,
            startLine: f.getStartLineNumber(),
            endLine: f.getEndLineNumber()
        });
    });

    sourceFile.getClasses().forEach(c => {
        const className = c.getName() || 'anonymous';
        c.getMethods().forEach(f => {
            const name = `${className}.${f.getName()}`;
            const text = f.getText();
            const braceIdx = text.indexOf('{');
            const sigText = braceIdx !== -1 ? text.substring(0, braceIdx).trim() : text.trim();
            results.push({
                name,
                signature: sigText,
                startLine: f.getStartLineNumber(),
                endLine: f.getEndLineNumber()
            });
        });
    });

    return results;
}

export function extractImports(filePath: string): ImportInfo[] {
    const sourceFile = project.addSourceFileAtPath(filePath);
    return sourceFile.getImportDeclarations().map(i => ({
        text: i.getText(),
        startLine: i.getStartLineNumber(),
        endLine: i.getEndLineNumber()
    }));
}

export function chunkForContext(filePath: string, targetName: string, budget: number): ChunkResult {
    const sourceFile = project.addSourceFileAtPath(filePath);
    let targetNode: FunctionDeclaration | MethodDeclaration | undefined;

    if (targetName.includes('.')) {
        const [className, methodName] = targetName.split('.');
        const cls = sourceFile.getClass(className);
        if (cls) {
            targetNode = cls.getMethod(methodName);
        }
    } else {
        targetNode = sourceFile.getFunction(targetName);
    }

    if (!targetNode) {
        throw new Error(`Target ${targetName} not found`);
    }

    const imports = extractImports(filePath).map(i => i.text).join('\\n');
    const nodeText = targetNode.getText();
    const startLine = targetNode.getStartLineNumber();
    const endLine = targetNode.getEndLineNumber();

    // Try Level 1
    const level1Code = imports ? `${imports}\\n\\n${nodeText}` : nodeText;
    if (countTokens(level1Code) <= budget) {
        return { level: 1, code: level1Code, startLine, endLine };
    }

    // Try Level 2 - Extract first few statements of the body and dummy out the rest
    const braceIdx = nodeText.indexOf('{');
    const block = targetNode.getBody();

    if (block && braceIdx !== -1) {
        const signatureText = nodeText.substring(0, braceIdx + 1);
        let stmtsCode = '';

        // We try to append statements one by one to see how many we can fit
        const stmts = targetNode.getStatements();
        let l2Candidate = `${imports ? imports + '\\n\\n' : ''}${signatureText}\\n  /* ... */\\n}`;
        let baseL2 = `${imports ? imports + '\\n\\n' : ''}${signatureText}\\n`;

        for (const stmt of stmts) {
            const stmtText = `  ${stmt.getText()}\\n`;
            if (countTokens(baseL2 + stmtsCode + stmtText + `  /* ... */\\n}`) <= budget) {
                stmtsCode += stmtText;
            } else {
                break;
            }
        }

        if (stmtsCode.length > 0) {
            const code = `${baseL2}${stmtsCode}  /* ... */\\n}`;
            if (countTokens(code) <= budget) {
                return { level: 2, code, startLine, endLine };
            }
        }
    }

    // Fallback Level 3 - strictly signature and jsdoc
    const sigText = braceIdx !== -1 ? nodeText.substring(0, braceIdx).trim() : nodeText.trim();
    const level3Code = `${sigText} {\\n  /* ... */\\n}`;
    return { level: 3, code: level3Code, startLine, endLine };
}

export function renderAnnotatedCode(filePath: string, code: string, startLine: number): string {
    const lines = code.split('\\n');
    const endLine = startLine + lines.length - 1;
    let result = `--- ${filePath}:${startLine}-${endLine} ---\\n`;
    lines.forEach((line, i) => {
        const currentLine = startLine + i;
        result += `  ${currentLine} | ${line}\\n`;
    });
    result += '---';
    return result;
}
