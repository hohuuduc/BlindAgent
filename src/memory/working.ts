// src/memory/working.ts
// WorkingMemory - Manages short-lived state slots within a single task execution.
// Supports three slot lifecycles: persistent, carry-over, and ephemeral.

import { SlotLifecycle, SlotEntry, StateSlots } from '../core/types';

const CARRY_OVER_DEFAULT_TTL = 1;

export class WorkingMemory {
    private slots: StateSlots = {};

    /**
     * Set a slot value with the given lifecycle.
     * - persistent: lives until the entire task completes
     * - carry-over: decremented each node advance; deleted when ttl reaches 0
     * - ephemeral: deleted at the end of the current node (on advanceNode)
     */
    set(slot: string, value: any, lifecycle: SlotLifecycle, ttl?: number): void {
        const entry: SlotEntry = { value, lifecycle };
        if (lifecycle === 'carry-over') {
            entry.ttl = ttl ?? CARRY_OVER_DEFAULT_TTL;
        }
        this.slots[slot] = entry;
    }

    /** Get the raw value of a slot. Returns undefined if not set. */
    get(slot: string): any {
        return this.slots[slot]?.value;
    }

    /** Check whether a slot exists. */
    has(slot: string): boolean {
        return slot in this.slots;
    }

    /**
     * Advance to the next node:
     * - Deletes all ephemeral slots immediately.
     * - Decrements carry-over TTL; deletes those that reach 0.
     * - Persistent slots are untouched.
     */
    advanceNode(): void {
        const toDelete: string[] = [];

        for (const [key, entry] of Object.entries(this.slots)) {
            if (entry.lifecycle === 'ephemeral') {
                toDelete.push(key);
            } else if (entry.lifecycle === 'carry-over') {
                const ttl = (entry.ttl ?? 1) - 1;
                if (ttl <= 0) {
                    toDelete.push(key);
                } else {
                    entry.ttl = ttl;
                }
            }
        }

        for (const key of toDelete) {
            delete this.slots[key];
        }
    }

    /**
     * Serialize all slots to a plain JSON-compatible object.
     * Used when saving a Checkpoint.
     */
    toJSON(): Record<string, any> {
        const result: Record<string, any> = {};
        for (const [key, entry] of Object.entries(this.slots)) {
            result[key] = entry;
        }
        return result;
    }

    /**
     * Reconstruct WorkingMemory from a previously serialized JSON object.
     * Used when restoring from a Checkpoint.
     */
    static fromJSON(data: Record<string, any>): WorkingMemory {
        const wm = new WorkingMemory();
        for (const [key, entry] of Object.entries(data)) {
            if (
                entry &&
                typeof entry === 'object' &&
                'value' in entry &&
                'lifecycle' in entry
            ) {
                wm.slots[key] = entry as SlotEntry;
            }
        }
        return wm;
    }

    /** Return the list of all slot names currently stored. */
    keys(): string[] {
        return Object.keys(this.slots);
    }
}
