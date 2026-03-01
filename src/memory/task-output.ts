// src/memory/task-output.ts
// TaskOutputManager - Persists inter-task output as JSON files on disk.
// Allows downstream tasks to load what the previous task produced without
// needing a running database; simple and reliable for sequential pipelines.

import * as fs from 'fs';
import * as path from 'path';
import { TaskSummary } from '../core/types';

export class TaskOutputManager {
    private dataDir: string;

    /**
     * Initialise with `dataDir` — the directory where per-task JSON files are
     * stored (one file per task, named `<taskId>.json`).
     * The directory is created automatically if it does not exist.
     */
    constructor(dataDir: string) {
        this.dataDir = dataDir;
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
    }

    /** Serialize and persist a TaskSummary to `<dataDir>/<taskId>.json`. */
    save(taskId: string, output: TaskSummary): void {
        const filePath = this.filePath(taskId);
        fs.writeFileSync(filePath, JSON.stringify(output, null, 2), 'utf-8');
    }

    /** Load a TaskSummary by taskId, or return null if the file does not exist. */
    load(taskId: string): TaskSummary | null {
        const filePath = this.filePath(taskId);
        if (!fs.existsSync(filePath)) return null;
        const raw = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(raw) as TaskSummary;
    }

    /**
     * Load the output of the task that ran immediately before `currentTaskId`.
     * Task files are named `<taskId>.json`. This method enumerates all saved
     * outputs, sorts them by mtime (last-modified time), and returns the most
     * recently written file that is NOT the current task.
     *
     * Returns null if no previous output exists.
     */
    loadPrevious(currentTaskId: string): TaskSummary | null {
        if (!fs.existsSync(this.dataDir)) return null;

        const files = fs
            .readdirSync(this.dataDir)
            .filter((f) => f.endsWith('.json') && f !== `${currentTaskId}.json`);

        if (files.length === 0) return null;

        // Sort by file modification time descending (most recent first)
        const sorted = files
            .map((f) => ({
                name: f,
                mtime: fs.statSync(path.join(this.dataDir, f)).mtimeMs,
            }))
            .sort((a, b) => b.mtime - a.mtime);

        const raw = fs.readFileSync(
            path.join(this.dataDir, sorted[0].name),
            'utf-8',
        );
        return JSON.parse(raw) as TaskSummary;
    }

    // --- private helpers ---

    private filePath(taskId: string): string {
        return path.join(this.dataDir, `${taskId}.json`);
    }
}
