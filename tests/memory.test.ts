// tests/memory.test.ts
// Comprehensive tests for all four memory modules:
//   WorkingMemory, CheckpointManager, EpisodicMemory, TaskOutputManager
// SemanticMemory is covered with a lightweight fake embedder so no network call
// is needed.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import { WorkingMemory } from '../src/memory/working';
import { CheckpointManager } from '../src/memory/checkpoint';
import { EpisodicMemory } from '../src/memory/episodic';
import { TaskOutputManager } from '../src/memory/task-output';
import { SemanticMemory } from '../src/memory/semantic';

import type { Checkpoint, ErrorEntry, TaskSummary } from '../src/core/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a fresh temporary directory for each test that needs file I/O. */
function makeTmpDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'agent-memory-test-'));
}

/** Recursively remove a directory (cleanup). */
function rmDir(dir: string): void {
    if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

// ---------------------------------------------------------------------------
// 1. WorkingMemory
// ---------------------------------------------------------------------------

describe('WorkingMemory', () => {
    let wm: WorkingMemory;

    beforeEach(() => {
        wm = new WorkingMemory();
    });

    it('should store and retrieve a persistent slot', () => {
        wm.set('taskInput', 'hello world', 'persistent');
        expect(wm.get('taskInput')).toBe('hello world');
    });

    it('should keep persistent slots after advanceNode', () => {
        wm.set('taskInput', 'persistent value', 'persistent');
        wm.advanceNode();
        expect(wm.get('taskInput')).toBe('persistent value');
    });

    it('should delete ephemeral slots after advanceNode', () => {
        wm.set('rawLlmResponse', '```json{}```', 'ephemeral');
        expect(wm.has('rawLlmResponse')).toBe(true);
        wm.advanceNode();
        expect(wm.has('rawLlmResponse')).toBe(false);
    });

    it('should keep carry-over slot alive for its TTL', () => {
        // default TTL = 1, so it survives 1 advance and is deleted on the second
        wm.set('lastOutput', 'output-1', 'carry-over', 1);
        wm.advanceNode(); // TTL 1 -> 0 => deleted
        expect(wm.has('lastOutput')).toBe(false);
    });

    it('should decrement carry-over TTL and keep slot while TTL > 0', () => {
        wm.set('lastOutput', 'output-2', 'carry-over', 2);
        wm.advanceNode(); // TTL 2 -> 1
        expect(wm.has('lastOutput')).toBe(true);
        wm.advanceNode(); // TTL 1 -> 0 => deleted
        expect(wm.has('lastOutput')).toBe(false);
    });

    it('should not affect other slots lifecycle during advance', () => {
        wm.set('p', 'keep', 'persistent');
        wm.set('e', 'gone', 'ephemeral');
        wm.set('c', 'temp', 'carry-over', 1);
        wm.advanceNode();

        expect(wm.has('p')).toBe(true);
        expect(wm.has('e')).toBe(false);
        expect(wm.has('c')).toBe(false);
    });

    it('should serialise and deserialise correctly via toJSON / fromJSON', () => {
        wm.set('a', 42, 'persistent');
        wm.set('b', [1, 2, 3], 'carry-over', 3);

        const json = wm.toJSON();
        const restored = WorkingMemory.fromJSON(json);

        expect(restored.get('a')).toBe(42);
        expect(restored.get('b')).toEqual([1, 2, 3]);
    });

    it('fromJSON should skip malformed entries', () => {
        const bad = { valid: { value: 'ok', lifecycle: 'persistent' }, bad: 'not-an-object' };
        const restored = WorkingMemory.fromJSON(bad as any);
        expect(restored.get('valid')).toBe('ok');
        expect(restored.has('bad')).toBe(false);
    });

    it('keys() returns all slot names', () => {
        wm.set('x', 1, 'persistent');
        wm.set('y', 2, 'ephemeral');
        expect(wm.keys().sort()).toEqual(['x', 'y']);
    });
});

// ---------------------------------------------------------------------------
// 2. CheckpointManager
// ---------------------------------------------------------------------------

describe('CheckpointManager', () => {
    let tmpDir: string;
    let dbPath: string;
    let mgr: CheckpointManager;

    const sampleCheckpoint: Checkpoint = {
        taskId: 'task-001',
        skillId: 'fix-bug',
        currentNodeId: 'analyze',
        stateSlots: { taskInput: { value: 'hello', lifecycle: 'persistent' } },
        summary: 'Analyzed imports',
        retryCount: 0,
        timestamp: Date.now(),
    };

    beforeEach(() => {
        tmpDir = makeTmpDir();
        dbPath = path.join(tmpDir, 'checkpoints.db');
        mgr = new CheckpointManager(dbPath);
    });

    afterEach(() => {
        mgr.close();
        rmDir(tmpDir);
    });

    it('save() then load() should return the same checkpoint', () => {
        mgr.save(sampleCheckpoint);
        const loaded = mgr.load('task-001');
        expect(loaded).not.toBeNull();
        expect(loaded!.taskId).toBe('task-001');
        expect(loaded!.skillId).toBe('fix-bug');
        expect(loaded!.currentNodeId).toBe('analyze');
        expect(loaded!.summary).toBe('Analyzed imports');
    });

    it('load() returns null for unknown taskId', () => {
        expect(mgr.load('no-such-task')).toBeNull();
    });

    it('save() overwrites an existing checkpoint with the same taskId', () => {
        mgr.save(sampleCheckpoint);
        const updated: Checkpoint = { ...sampleCheckpoint, currentNodeId: 'fix', retryCount: 1 };
        mgr.save(updated);

        const loaded = mgr.load('task-001');
        expect(loaded!.currentNodeId).toBe('fix');
        expect(loaded!.retryCount).toBe(1);
    });

    it('delete() removes a checkpoint', () => {
        mgr.save(sampleCheckpoint);
        mgr.delete('task-001');
        expect(mgr.load('task-001')).toBeNull();
    });

    it('loadIncomplete() returns the most recent checkpoint', () => {
        const cp1: Checkpoint = { ...sampleCheckpoint, taskId: 't1', timestamp: 1000 };
        const cp2: Checkpoint = { ...sampleCheckpoint, taskId: 't2', timestamp: 2000 };
        mgr.save(cp1);
        mgr.save(cp2);

        const inc = mgr.loadIncomplete();
        expect(inc!.taskId).toBe('t2');
    });

    it('loadIncomplete() returns null when table is empty', () => {
        expect(mgr.loadIncomplete()).toBeNull();
    });

    it('creates the database file at the specified path', () => {
        expect(fs.existsSync(dbPath)).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// 3. EpisodicMemory
// ---------------------------------------------------------------------------

describe('EpisodicMemory', () => {
    let tmpDir: string;
    let dbPath: string;
    let mem: EpisodicMemory;

    const makeEntry = (overrides: Partial<ErrorEntry> = {}): ErrorEntry => ({
        errorType: 'TypeError',
        errorMessage: "Cannot read property 'x' of undefined",
        file: 'src/foo.ts',
        line: 42,
        fix: "Add null-check: if (obj) { ... }",
        timestamp: Date.now(),
        ...overrides,
    });

    beforeEach(() => {
        tmpDir = makeTmpDir();
        dbPath = path.join(tmpDir, 'episodic.db');
        mem = new EpisodicMemory(dbPath);
    });

    afterEach(() => {
        mem.close();
        rmDir(tmpDir);
    });

    it('saveError() then findSimilar() returns the saved entry', () => {
        const entry = makeEntry();
        mem.saveError(entry);

        const found = mem.findSimilar('TypeError', 'src/foo.ts');
        expect(found).not.toBeNull();
        expect(found!.errorType).toBe('TypeError');
        expect(found!.file).toBe('src/foo.ts');
        expect(found!.fix).toBe("Add null-check: if (obj) { ... }");
    });

    it('findSimilar() returns null if no matching error', () => {
        expect(mem.findSimilar('RangeError', 'src/bar.ts')).toBeNull();
    });

    it('findSimilar() matches on both errorType AND file', () => {
        mem.saveError(makeEntry({ errorType: 'TypeError', file: 'src/a.ts', fix: 'fix-a' }));
        mem.saveError(makeEntry({ errorType: 'TypeError', file: 'src/b.ts', fix: 'fix-b' }));

        const result = mem.findSimilar('TypeError', 'src/b.ts');
        expect(result!.fix).toBe('fix-b');
    });

    it('findSimilar() returns most recent entry when multiple match', () => {
        mem.saveError(makeEntry({ fix: 'old-fix', timestamp: 1000 }));
        mem.saveError(makeEntry({ fix: 'new-fix', timestamp: 2000 }));

        const result = mem.findSimilar('TypeError', 'src/foo.ts');
        expect(result!.fix).toBe('new-fix');
    });

    it('getRecentErrors() returns entries ordered by timestamp desc', () => {
        mem.saveError(makeEntry({ errorType: 'SyntaxError', timestamp: 1000 }));
        mem.saveError(makeEntry({ errorType: 'TypeError', timestamp: 3000 }));
        mem.saveError(makeEntry({ errorType: 'RangeError', timestamp: 2000 }));

        const recent = mem.getRecentErrors(3);
        expect(recent[0].errorType).toBe('TypeError');
        expect(recent[1].errorType).toBe('RangeError');
        expect(recent[2].errorType).toBe('SyntaxError');
    });

    it('getRecentErrors() respects the limit', () => {
        for (let i = 0; i < 5; i++) {
            mem.saveError(makeEntry({ timestamp: i * 100 }));
        }
        expect(mem.getRecentErrors(3)).toHaveLength(3);
    });

    it('getRecentErrors() returns empty array when nothing saved', () => {
        expect(mem.getRecentErrors(10)).toEqual([]);
    });

    it('auto-assigns id when not provided', () => {
        mem.saveError(makeEntry());
        const recent = mem.getRecentErrors(1);
        expect(typeof recent[0].id).toBe('number');
    });
});

// ---------------------------------------------------------------------------
// 4. TaskOutputManager
// ---------------------------------------------------------------------------

describe('TaskOutputManager', () => {
    let tmpDir: string;
    let mgr: TaskOutputManager;

    const makeSummary = (text: string): TaskSummary => ({
        files_affected: [{ path: 'src/foo.ts', action: 'modified', description: text }],
        key_functions: [{ name: 'foo', file: 'src/foo.ts', purpose: text }],
        dependencies_added: [],
        summary_text: text,
    });

    beforeEach(() => {
        tmpDir = makeTmpDir();
        mgr = new TaskOutputManager(tmpDir);
    });

    afterEach(() => {
        rmDir(tmpDir);
    });

    it('save() then load() returns the exact same summary', () => {
        const summary = makeSummary('task-A output');
        mgr.save('task-A', summary);
        const loaded = mgr.load('task-A');

        expect(loaded).not.toBeNull();
        expect(loaded!.summary_text).toBe('task-A output');
        expect(loaded!.files_affected[0].path).toBe('src/foo.ts');
    });

    it('load() returns null for unknown taskId', () => {
        expect(mgr.load('ghost-task')).toBeNull();
    });

    it('save() overwrites an existing task output', () => {
        mgr.save('task-A', makeSummary('first'));
        mgr.save('task-A', makeSummary('second'));
        const loaded = mgr.load('task-A');
        expect(loaded!.summary_text).toBe('second');
    });

    it('loadPrevious() loads the output of the previous task', async () => {
        // Save task-A first (older), then task-B
        mgr.save('task-A', makeSummary('output-A'));
        // Small delay to ensure different mtime
        await new Promise((r) => setTimeout(r, 20));
        mgr.save('task-B', makeSummary('output-B'));

        // From task-B's perspective, the previous task is task-A
        const prev = mgr.loadPrevious('task-B');
        expect(prev).not.toBeNull();
        expect(prev!.summary_text).toBe('output-A');
    });

    it('loadPrevious() returns null when there is no other task output', () => {
        mgr.save('task-A', makeSummary('only one'));
        expect(mgr.loadPrevious('task-A')).toBeNull();
    });

    it('loadPrevious() returns null when dataDir is empty', () => {
        expect(mgr.loadPrevious('task-X')).toBeNull();
    });

    it('creates dataDir automatically on construction', () => {
        const newDir = path.join(tmpDir, 'sub', 'outputs');
        const m = new TaskOutputManager(newDir);
        expect(fs.existsSync(newDir)).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// 5. SemanticMemory (unit — fake embed, no network)
// ---------------------------------------------------------------------------

describe('SemanticMemory', () => {
    let tmpDir: string;
    let mem: SemanticMemory;

    // Deterministic fake embedder: each word/char maps to a fixed dimension
    const DIM = 4;
    const fakeEmbed = async (text: string): Promise<number[]> => {
        const vec = new Array(DIM).fill(0);
        for (let i = 0; i < text.length; i++) {
            vec[i % DIM] += text.charCodeAt(i) / 255;
        }
        // Normalise
        const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
        return vec.map((v) => v / norm);
    };

    beforeEach(async () => {
        tmpDir = makeTmpDir();
        mem = new SemanticMemory(path.join(tmpDir, 'vector-index'), fakeEmbed);
        await mem.init();
    });

    afterEach(() => {
        rmDir(tmpDir);
    });

    it('add() then search() returns at least one result', async () => {
        await mem.add('TypeScript type error in foo.ts', { source: 'plan1' });
        const results = await mem.search('TypeScript error', 1);
        expect(results.length).toBeGreaterThan(0);
    });

    it('search() result contains text and score', async () => {
        await mem.add('memory module design', { module: 'memory' });
        const results = await mem.search('memory design', 1);
        expect(results[0]).toHaveProperty('text');
        expect(results[0]).toHaveProperty('score');
    });

    it('search() score is a number in (0, 1]', async () => {
        await mem.add('agent planning system', { tag: 'planning' });
        const results = await mem.search('agent planning', 1);
        expect(results[0].score).toBeGreaterThan(0);
        expect(results[0].score).toBeLessThanOrEqual(1);
    });

    it('search() topK limits the number of results', async () => {
        for (let i = 0; i < 5; i++) {
            await mem.add(`document ${i}`, { idx: i });
        }
        const results = await mem.search('document', 3);
        expect(results.length).toBeLessThanOrEqual(3);
    });

    it('init() is idempotent (calling twice does not throw)', async () => {
        await expect(mem.init()).resolves.not.toThrow();
    });
});
