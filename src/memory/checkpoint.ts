// src/memory/checkpoint.ts
// CheckpointManager - Crash recovery via SQLite WAL.
// Saves the full task state before each node execution so that if the process
// crashes, execution can resume from the last good checkpoint.

import Database, { Database as DB } from 'better-sqlite3';
import { Checkpoint } from '../core/types';
import * as path from 'path';
import * as fs from 'fs';

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS checkpoints (
  task_id    TEXT    PRIMARY KEY,
  data       TEXT    NOT NULL,
  created_at INTEGER NOT NULL
);
`;

export class CheckpointManager {
    private db: DB;

    /**
     * Open (or create) the SQLite database at `dbPath`.
     * Enables WAL mode for safe concurrent writes.
     */
    constructor(dbPath: string) {
        // Ensure parent directory exists
        const dir = path.dirname(dbPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        this.db = new Database(dbPath);
        this.db.pragma('journal_mode = WAL');
        this.db.exec(CREATE_TABLE_SQL);
    }

    /** Persist a checkpoint for the given task. Overwrites if already exists. */
    save(checkpoint: Checkpoint): void {
        const stmt = this.db.prepare(`
            INSERT INTO checkpoints (task_id, data, created_at)
            VALUES (@task_id, @data, @created_at)
            ON CONFLICT(task_id) DO UPDATE SET
                data       = excluded.data,
                created_at = excluded.created_at
        `);
        stmt.run({
            task_id: checkpoint.taskId,
            data: JSON.stringify(checkpoint),
            created_at: checkpoint.timestamp,
        });
    }

    /** Load a checkpoint by taskId, or null if not found. */
    load(taskId: string): Checkpoint | null {
        const row = this.db
            .prepare('SELECT data FROM checkpoints WHERE task_id = ?')
            .get(taskId) as { data: string } | undefined;

        if (!row) return null;
        return JSON.parse(row.data) as Checkpoint;
    }

    /**
     * Find the most recent incomplete checkpoint.
     * Useful on start-up to detect whether a previous run crashed.
     * Returns the checkpoint with the latest created_at timestamp.
     */
    loadIncomplete(): Checkpoint | null {
        const row = this.db
            .prepare('SELECT data FROM checkpoints ORDER BY created_at DESC LIMIT 1')
            .get() as { data: string } | undefined;

        if (!row) return null;
        return JSON.parse(row.data) as Checkpoint;
    }

    /** Delete a checkpoint after the task completes successfully. */
    delete(taskId: string): void {
        this.db
            .prepare('DELETE FROM checkpoints WHERE task_id = ?')
            .run(taskId);
    }

    /** Close the database connection (useful for testing cleanup). */
    close(): void {
        this.db.close();
    }
}
