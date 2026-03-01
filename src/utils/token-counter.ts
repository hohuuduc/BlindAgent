import { encode, decode } from 'gpt-tokenizer';

export function countTokens(text: string): number {
    if (!text) return 0;
    return encode(text).length;
}

export function trimToTokenBudget(text: string, budget: number): string {
    if (!text) return '';
    const tokens = encode(text);
    if (tokens.length <= budget) return text;
    return decode(tokens.slice(0, budget));
}
