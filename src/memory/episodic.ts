// src/memory/episodic.ts
// EpisodicMemory - SQLite-backed error pattern store.
// Records past errors and their successful fixes so they can be retrieved
// as few-shot examples when similar errors occur in future tasks.

import Database, { Database as DB } from 'better-sqlite3';
import { ErrorEntry } from '../core/types';
import * as path from 'path';
import * as fs from 'fs';

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS episodic_errors (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  error_type   TEXT    NOT NULL,
  error_message TEXT   NOT NULL,
  file         TEXT    NOT NULL,
  line         INTEGER,
  fix          TEXT    NOT NULL,
  timestamp    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_error_type ON episodic_errors (error_type);
CREATE INDEX IF NOT EXISTS idx_file ON episodic_errors (file);
`;

export class EpisodicMemory {
    private db: DB;

    /**
     * Open (or create) the SQLite database at `dbPath`.
     * Enables WAL mode to match CheckpointManager conventions.
     */
    constructor(dbPath: string) {
        const dir = path.dirname(dbPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        this.db = new Database(dbPath);
        this.db.pragma('journal_mode = WAL');
        this.db.exec(CREATE_TABLE_SQL);
    }

    /** Persist an error entry (omit `id`; it is auto-assigned). */
    saveError(error: ErrorEntry): void {
        const stmt = this.db.prepare(`
            INSERT INTO episodic_errors
                (error_type, error_message, file, line, fix, timestamp)
            VALUES
                (@errorType, @errorMessage, @file, @line, @fix, @timestamp)
        `);
        stmt.run({
            errorType: error.errorType,
            errorMessage: error.errorMessage,
            file: error.file,
            line: error.line ?? null,
            fix: error.fix,
            timestamp: error.timestamp,
        });
    }

    /**
     * Find the most recent error matching `errorType` **and** `file`.
     * Returns `null` if no matching entry exists.
     */
    findSimilar(errorType: string, file: string): ErrorEntry | null {
        const row = this.db
            .prepare(`
                SELECT id, error_type, error_message, file, line, fix, timestamp
                FROM episodic_errors
                WHERE error_type = ? AND file = ?
                ORDER BY timestamp DESC
                LIMIT 1
            `)
            .get(errorType, file) as any | undefined;

        if (!row) return null;
        return this.rowToEntry(row);
    }

    /**
     * Return the most recent `limit` error entries across all files.
     * Useful for constructing a general few-shot context block.
     */
    getRecentErrors(limit: number): ErrorEntry[] {
        const rows = this.db
            .prepare(`
                SELECT id, error_type, error_message, file, line, fix, timestamp
                FROM episodic_errors
                ORDER BY timestamp DESC
                LIMIT ?
            `)
            .all(limit) as any[];

        return rows.map((r) => this.rowToEntry(r));
    }

    /** Close the database connection. */
    close(): void {
        this.db.close();
    }

    // --- private helpers ---

    private rowToEntry(row: any): ErrorEntry {
        return {
            id: row.id,
            errorType: row.error_type,
            errorMessage: row.error_message,
            file: row.file,
            line: row.line ?? undefined,
            fix: row.fix,
            timestamp: row.timestamp,
        };
    }
}
