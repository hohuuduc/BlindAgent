// src/memory/semantic.ts
// SemanticMemory - Vector DB wrapper using the `vectra` local index.
// The embed() function is injected from LLMProvider at wire-up time, keeping
// this module decoupled from any specific embedding API.
// Includes safe wrappers that never throw — returns empty results on failure.

import { LocalIndex } from 'vectra';
import { SearchResult } from '../core/types';
import { logger } from '../utils/logger';

export type EmbedFn = (text: string) => Promise<number[]>;

export class SemanticMemory {
    private index: LocalIndex;
    private embed: EmbedFn;
    private _available: boolean = false;

    /**
     * Initialise the vector index at `indexPath`.
     * `embedFn` must be provided to convert text into embedding vectors.
     * Call `init()` before using `add()` or `search()`.
     */
    constructor(indexPath: string, embedFn: EmbedFn) {
        this.index = new LocalIndex(indexPath);
        this.embed = embedFn;
    }

    /** Whether init() succeeded and this instance is usable. */
    get available(): boolean {
        return this._available;
    }

    /**
     * Create the index directory if it does not exist yet.
     * Sets `available = true` on success, `false` on failure.
     */
    async init(): Promise<boolean> {
        try {
            const exists = await this.index.isIndexCreated();
            if (!exists) {
                await this.index.createIndex();
            }
            this._available = true;
            logger.info('SemanticMemory', 'Vector index initialized');
            return true;
        } catch (err: any) {
            this._available = false;
            logger.warn('SemanticMemory', `Failed to initialize vector index: ${err.message}`);
            return false;
        }
    }

    /**
     * Embed `text` and add it to the vector index together with `metadata`.
     * Metadata can hold any auxiliary information (source file, node id, etc.)
     */
    async add(text: string, metadata: Record<string, any>): Promise<void> {
        const vector = await this.embed(text);
        await this.index.insertItem({
            vector,
            metadata: { ...metadata, text },
        });
    }

    /**
     * Search for the `topK` nearest neighbors of `query` in the index.
     * Returns an array of SearchResult sorted by descending similarity score.
     */
    async search(query: string, topK: number): Promise<SearchResult[]> {
        const vector = await this.embed(query);
        const results = await this.index.queryItems(vector, query, topK);

        return results.slice(0, topK).map((r) => ({
            text: (r.item.metadata as any).text ?? '',
            score: r.score,
            metadata: r.item.metadata as Record<string, any>,
        }));
    }

    // ─── Safe Wrappers (never throw) ────────────────────────────

    /**
     * Safe version of `add()`. Logs warning on failure, never throws.
     * Returns true if the item was added successfully.
     */
    async safeAdd(text: string, metadata: Record<string, any>): Promise<boolean> {
        if (!this._available) return false;
        try {
            await this.add(text, metadata);
            return true;
        } catch (err: any) {
            logger.warn('SemanticMemory', `safeAdd failed: ${err.message}`);
            return false;
        }
    }

    /**
     * Safe version of `search()`. Returns empty array on failure, never throws.
     */
    async safeSearch(query: string, topK: number): Promise<SearchResult[]> {
        if (!this._available) return [];
        try {
            return await this.search(query, topK);
        } catch (err: any) {
            logger.warn('SemanticMemory', `safeSearch failed: ${err.message}`);
            return [];
        }
    }
}
