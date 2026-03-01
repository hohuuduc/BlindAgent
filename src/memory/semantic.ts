// src/memory/semantic.ts
// SemanticMemory - Vector DB wrapper using the `vectra` local index.
// The embed() function is injected from LLMProvider at wire-up time, keeping
// this module decoupled from any specific embedding API.

import { LocalIndex } from 'vectra';
import { SearchResult } from '../core/types';
import * as path from 'path';

export type EmbedFn = (text: string) => Promise<number[]>;

export class SemanticMemory {
    private index: LocalIndex;
    private embed: EmbedFn;

    /**
     * Initialise the vector index at `indexPath`.
     * `embedFn` must be provided to convert text into embedding vectors.
     * Call `init()` before using `add()` or `search()`.
     */
    constructor(indexPath: string, embedFn: EmbedFn) {
        this.index = new LocalIndex(indexPath);
        this.embed = embedFn;
    }

    /** Create the index directory if it does not exist yet. */
    async init(): Promise<void> {
        const exists = await this.index.isIndexCreated();
        if (!exists) {
            await this.index.createIndex();
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
}
