import { describe, it, expect } from 'vitest';
import { sanitizeLLMJson } from '../src/core/json-sanitizer';

describe('sanitizeLLMJson', () => {
    it('1. Pure JSON — pass through', () => {
        const input = '{"a": 1, "b": "text"}';
        expect(sanitizeLLMJson(input)).toBe('{"a": 1, "b": "text"}');
    });

    it('2. JSON wrapped in ```json ... ```', () => {
        const input = '```json\n{"a": 1}\n```';
        expect(sanitizeLLMJson(input)).toBe('{"a": 1}');
    });

    it('3. JSON with leading text', () => {
        const input = 'Here is the JSON:\n{"a": 1}';
        expect(sanitizeLLMJson(input)).toBe('{"a": 1}');
    });

    it('4. JSON with trailing text', () => {
        const input = '{"a": 1}\nHope this helps!';
        expect(sanitizeLLMJson(input)).toBe('{"a": 1}');
    });

    it('5. Trailing commas', () => {
        const input = '{"a": 1, "b": 2,}';
        expect(sanitizeLLMJson(input)).toBe('{"a": 1, "b": 2}');
    });

    it('6. Single quotes', () => {
        const input = "{'a': 'value'}";
        expect(sanitizeLLMJson(input)).toBe('{"a": "value"}');
    });

    it('7. Missing closing bracket', () => {
        const input = '{"a": 1';
        expect(sanitizeLLMJson(input)).toBe('{"a": 1}');
    });

    it('8. Missing comma between properties', () => {
        const input = '{"a": 1 "b": 2}';
        expect(sanitizeLLMJson(input)).toBe('{"a": 1, "b": 2}');
    });

    it('9. Nested objects wrapped in markdown', () => {
        const input = '```\n{"a": {"b": [1, 2]}}\n```';
        expect(sanitizeLLMJson(input)).toBe('{"a": {"b": [1, 2]}}');
    });

    it('10. Array output', () => {
        const input = '[{"a": 1}, {"b": 2}]';
        expect(sanitizeLLMJson(input)).toBe('[{"a": 1}, {"b": 2}]');
    });

    it('11. Empty/whitespace input -> throw', () => {
        expect(() => sanitizeLLMJson('')).toThrow('Input is empty or whitespace');
        expect(() => sanitizeLLMJson('   \n  ')).toThrow('Input is empty or whitespace');
    });

    it('12. Completely invalid JSON -> throw', () => {
        const input = 'This is just some text, no brackets like here.';
        expect(() => sanitizeLLMJson(input)).toThrow('Completely invalid JSON');
    });
});
