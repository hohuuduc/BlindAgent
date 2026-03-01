import { jsonrepair } from 'jsonrepair';

function extractJsonObject(text: string): string {
    const firstBracket = text.indexOf('{');
    const firstArray = text.indexOf('[');

    let startChar = '';
    let startIndex = -1;

    if (firstBracket === -1 && firstArray === -1) {
        throw new Error("No JSON object or array found");
    } else if (firstBracket === -1) {
        startIndex = firstArray;
        startChar = '[';
    } else if (firstArray === -1) {
        startIndex = firstBracket;
        startChar = '{';
    } else {
        startIndex = Math.min(firstBracket, firstArray);
        startChar = startIndex === firstBracket ? '{' : '[';
    }

    const endChar = startChar === '{' ? '}' : ']';
    const endIndex = text.lastIndexOf(endChar);

    if (endIndex !== -1 && endIndex >= startIndex) {
        return text.substring(startIndex, endIndex + 1);
    }

    // If no closing bracket is found (might be truncated), take the rest of the string
    return text.substring(startIndex);
}

export function sanitizeLLMJson(raw: string): string {
    if (!raw || raw.trim() === '') {
        throw new Error('Input is empty or whitespace');
    }

    let cleaned = raw;

    // 1. stripMarkdownCodeBlock() - Regex to remove ```json ... ```
    const markdownRegex = /```(?:json)?\s*([\s\S]*?)\s*```/i;
    const match = cleaned.match(markdownRegex);
    if (match) {
        cleaned = match[1];
    }

    // 2. extractJsonObject() - Find the outermost { } or [ ]
    try {
        cleaned = extractJsonObject(cleaned);
    } catch (e: any) {
        throw new Error('Completely invalid JSON');
    }

    // 3. jsonrepair() - Fix missing commas, quotes, trailing commas, single quotes, etc.
    try {
        const repaired = jsonrepair(cleaned);
        return repaired;
    } catch (e: any) {
        throw new Error(`Failed to repair JSON: ${e.message}`);
    }
}
