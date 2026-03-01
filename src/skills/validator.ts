// src/skills/validator.ts
// Validates SkillGraph integrity — checks for dangling edges, dead-ends, etc.

import { SkillGraph } from '../core/types';

export interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}

/**
 * Validate a SkillGraph for structural correctness.
 * Returns errors (blocking) and warnings (non-blocking).
 */
export function validateSkillGraph(skill: SkillGraph): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const nodeIds = new Set(skill.nodes.keys());

    if (nodeIds.size === 0) {
        errors.push('Skill has no nodes defined');
        return { valid: false, errors, warnings };
    }

    for (const [nodeId, node] of skill.nodes) {
        // Check edge targets exist
        for (const edge of node.edges) {
            if (!nodeIds.has(edge.target)) {
                errors.push(`Node "${nodeId}" has edge to non-existent target "${edge.target}"`);
            }
        }

        // Check for dead-end nodes (no outgoing edges, not a terminal node)
        if (node.edges.length === 0 && node.tool !== 'llm') {
            // Terminal tools without edges are OK only if they're the last node
            warnings.push(`Node "${nodeId}" has no outgoing edges (dead-end)`);
        }

        // Check LLM nodes have prompt templates
        if (node.tool === 'llm' && node.promptTemplate) {
            if (!skill.promptTemplates.has(node.promptTemplate)) {
                errors.push(`Node "${nodeId}" references missing prompt template "${node.promptTemplate}"`);
            }
        }

        // Check human_input nodes have required fields
        if (node.tool === 'human_input') {
            if (!node.promptUser) {
                warnings.push(`Human input node "${nodeId}" is missing promptUser text`);
            }
        }
    }

    // Check for unreachable nodes (simple: nodes not targeted by any edge, except the first)
    const firstNodeId = skill.nodes.keys().next().value;
    const targeted = new Set<string>();
    for (const [, node] of skill.nodes) {
        for (const edge of node.edges) {
            targeted.add(edge.target);
        }
    }
    for (const nodeId of nodeIds) {
        if (nodeId !== firstNodeId && !targeted.has(nodeId)) {
            warnings.push(`Node "${nodeId}" is unreachable (not targeted by any edge)`);
        }
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings,
    };
}
