// src/skills/registry.ts
// Skill registry — loads all .md skill files from a directory and provides lookup.

import * as fs from 'fs';
import * as path from 'path';
import { SkillGraph } from '../core/types';
import { loadSkillFromFile } from './loader';

export class SkillRegistry {
    private skills = new Map<string, SkillGraph>();

    /**
     * Load all .md files from `skillsDir` and register them.
     */
    loadFromDirectory(skillsDir: string): void {
        if (!fs.existsSync(skillsDir)) {
            throw new Error(`Skills directory not found: ${skillsDir}`);
        }

        const files = fs.readdirSync(skillsDir).filter(f => f.endsWith('.md'));

        for (const file of files) {
            const filePath = path.join(skillsDir, file);
            try {
                const skill = loadSkillFromFile(filePath);
                this.skills.set(skill.name, skill);
            } catch (err: any) {
                console.warn(`Failed to load skill ${file}: ${err.message}`);
            }
        }
    }

    /** Register a single skill manually. */
    register(skill: SkillGraph): void {
        this.skills.set(skill.name, skill);
    }

    /** Get a skill by its name, or null if not found. */
    get(name: string): SkillGraph | null {
        return this.skills.get(name) ?? null;
    }

    /** Check if a skill exists by name. */
    has(name: string): boolean {
        return this.skills.has(name);
    }

    /** Return all registered skill names. */
    listNames(): string[] {
        return Array.from(this.skills.keys());
    }

    /** Return all skills with name + description for Plan Agent prompt. */
    listSummaries(): { name: string; description: string }[] {
        return Array.from(this.skills.values()).map(s => ({
            name: s.name,
            description: s.description,
        }));
    }
}
