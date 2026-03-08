// src/index.ts
// CLI entry point for BlindAgent.
// Ties together: Config → LLM → Skills → Tools → Memory → Plan Agent → Task Agent.

import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import { loadConfig } from './core/config';
import { createLLMProvider } from './core/llm-provider';
import { SkillRegistry } from './skills/registry';
import { ToolRegistry } from './tools/registry';
import { createFileTools } from './tools/file-ops';
import { createTerminalTools } from './tools/terminal';
import { createSyntaxTools } from './tools/syntax-check';
import { CheckpointManager } from './memory/checkpoint';
import { TaskOutputManager } from './memory/task-output';
import { EpisodicMemory } from './memory/episodic';
import { SemanticMemory } from './memory/semantic';
import { generatePlan } from './agents/plan-agent';
import { runTask, TaskAgentDeps } from './agents/task-agent';
import { Task } from './core/types';
import { logger, setLogLevel } from './utils/logger';

// ─── ANSI Colors ────────────────────────────────────────────

const Colors = {
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    reset: '\x1b[0m',
    bold: '\x1b[1m',
} as const;

// ─── ASCII Banner ───────────────────────────────────────────

function printBanner(): void {
    const pkgPath = path.join(__dirname, '../package.json');
    let version = '1.0';
    try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        if (pkg.version) version = pkg.version;
    } catch (e) {
        // ignore if missing or error
    }

    const title = `BlindAgent v${version}`;
    const leftPad = Math.floor((35 - title.length) / 2);
    const rightPad = 35 - title.length - leftPad;

    console.log(`
╔═══════════════════════════════════╗
║${' '.repeat(Math.max(0, leftPad))}${title}${' '.repeat(Math.max(0, rightPad))}║
║     State Machine · Local LLM     ║
╚═══════════════════════════════════╝
`);
}

// ─── Interactive Helpers ────────────────────────────────────

function createRL(): readline.Interface {
    return readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
}

function ask(rl: readline.Interface, question: string): Promise<string> {
    return new Promise(resolve => rl.question(question, resolve));
}

function displayPlan(tasks: Task[]): void {
    console.log('\n[PLAN] Generated Plan:\n');
    for (const task of tasks) {
        const skill = task.skillId ? `[${task.skillId}]` : '[no skill]';
        const deps = task.dependencies.length > 0 ? ` (after: ${task.dependencies.join(', ')})` : '';
        console.log(`  ${task.id}: ${task.title} ${skill}${deps}`);
        console.log(`         → ${task.input.slice(0, 100)}`);
    }
    console.log('');
}

function displayTaskResult(task: Task): void {
    if (task.status === 'success') {
        console.log(`  ${Colors.green}[OK]${Colors.reset} ${task.id}: ${task.title} → ${task.status}`);
    } else if (task.status === 'failed') {
        console.log(`  ${Colors.red}[FAILED]${Colors.reset} ${task.id}: ${task.title} → ${task.status}`);
    } else if (task.status === 'blocked') {
        console.log(`  ${Colors.red}[BLOCKED]${Colors.reset} ${task.id}: ${task.title} → ${task.status}`);
    } else if (task.status === 'skipped') {
        console.log(`  ${Colors.yellow}[SKIPPED]${Colors.reset} ${task.id}: ${task.title} → ${task.status}`);
    } else {
        console.log(`  [${task.status.toUpperCase()}] ${task.id}: ${task.title} → ${task.status}`);
    }
    if (task.output?.summary_text) {
        console.log(`     - ${task.output.summary_text.slice(0, 120)}`);
    }
}

function displayFinalReport(task: Task): void {
    const reportText = task.output?.summary_text || 'No report generated.';
    console.log(`\n${Colors.bold}${Colors.green}════════════════════════════════════════════════════${Colors.reset}`);
    console.log(`${Colors.bold}${Colors.green}  FINAL REPORT${Colors.reset}`);
    console.log(`${Colors.bold}${Colors.green}════════════════════════════════════════════════════${Colors.reset}`);
    console.log(`${Colors.green}${reportText}${Colors.reset}`);
    console.log(`${Colors.bold}${Colors.green}════════════════════════════════════════════════════${Colors.reset}\n`);
}

// ─── Main Loop ──────────────────────────────────────────────

async function main(): Promise<void> {
    printBanner();
    setLogLevel('info');

    // Load config
    const config = loadConfig();
    logger.info('Main', `Config loaded: provider=${config.provider}, model=${config.ollama.model}`);

    // Initialize LLM
    const llm = createLLMProvider(config);

    // Health check
    const healthy = await llm.healthCheck();
    if (!healthy) {
        console.error('[ERROR] Cannot connect to Ollama. Please ensure it is running.');
        console.error(`   Expected at: ${config.ollama.baseUrl}`);
        process.exit(1);
    }
    logger.info('Main', 'LLM provider connected');

    // Probe embed model availability
    let semanticMemory: SemanticMemory | undefined;
    try {
        await llm.embed('health check');
        const vectorDir = path.join(process.cwd(), 'data', 'vector_index');
        semanticMemory = new SemanticMemory(vectorDir, (text) => llm.embed(text));
        const initOk = await semanticMemory.init();
        if (!initOk) {
            semanticMemory = undefined;
        } else {
            logger.info('Main', 'Semantic memory initialized (vector index ready)');
        }
    } catch (err: any) {
        logger.warn('Main', `Embed model unavailable, semantic memory disabled: ${err.message}`);
        semanticMemory = undefined;
    }

    // Initialize Skills
    const skills = new SkillRegistry();
    const skillsDir = path.join(process.cwd(), 'skills');
    skills.loadFromDirectory(skillsDir);
    logger.info('Main', `Loaded skills: ${skills.listNames().join(', ')}`);

    // Initialize Tools
    const tools = new ToolRegistry();
    for (const tool of [...createFileTools(), ...createTerminalTools(), ...createSyntaxTools()]) {
        tools.register(tool);
    }
    logger.info('Main', `Registered tools: ${tools.listNames().join(', ')}`);

    // Initialize Memory
    const dataDir = path.join(process.cwd(), 'data');
    const checkpoint = new CheckpointManager(path.join(dataDir, 'checkpoint.db'));
    const taskOutput = new TaskOutputManager(path.join(dataDir, 'tasks'));
    const episodic = new EpisodicMemory(path.join(dataDir, 'episodic.db'));

    // Check for crash recovery
    const incomplete = checkpoint.loadIncomplete();
    if (incomplete) {
        console.log(`\n[WARNING] Found incomplete task from previous session: "${incomplete.taskId}"`);
        console.log(`   Last node: "${incomplete.currentNodeId}"`);
        const rl = createRL();
        const answer = await ask(rl, '   Resume? (y/n): ');
        rl.close();

        if (answer.toLowerCase() === 'y') {
            // TODO: Resume task execution
            logger.info('Main', 'Resuming previous task...');
        } else {
            checkpoint.delete(incomplete.taskId);
            logger.info('Main', 'Cleared incomplete checkpoint');
        }
    }

    // Main interactive loop
    const rl = createRL();
    console.log('Type your request (or "exit" to quit):\n');

    while (true) {
        const userInput = await ask(rl, 'User > ');
        const trimmed = userInput.trim();

        if (!trimmed || trimmed.toLowerCase() === 'exit') {
            console.log('\nGoodbye!');
            break;
        }

        try {
            // Step 1: Generate plan
            console.log('\n[PLANNING]...');
            const tasks = await generatePlan(trimmed, llm, skills, semanticMemory, config);
            displayPlan(tasks);

            // Step 2: Confirm plan
            const confirm = await ask(rl, 'Execute this plan? (y/n/edit): ');
            if (confirm.toLowerCase() !== 'y') {
                console.log('Plan cancelled.\n');
                continue;
            }

            // Step 3: Execute tasks sequentially
            console.log('\nExecuting...\n');
            const deps: TaskAgentDeps = {
                llm,
                skills,
                tools,
                checkpoint,
                taskOutput,
                semanticMemory,
                config,
            };

            for (const task of tasks) {
                // Check dependencies
                const depsMet = task.dependencies.every(
                    depId => tasks.find(t => t.id === depId)?.status === 'success'
                );

                if (!depsMet) {
                    task.status = 'skipped';
                    console.log(`  [SKIPPED] ${task.id}: Skipped (dependency not met)`);
                    continue;
                }

                await runTask(task, deps);
                displayTaskResult(task);

                // If task blocked, ask user
                if (task.status === 'blocked') {
                    const action = await ask(rl, '  Action? (skip/retry): ');
                    if (action.toLowerCase() === 'retry') {
                        task.status = 'queued';
                        task.retryCount = 0;
                        await runTask(task, deps);
                        displayTaskResult(task);
                    } else {
                        task.status = 'skipped';
                    }
                }
            }

            // Summary
            console.log('\n────────────────────────────────────');
            console.log('[RESULTS]');
            for (const task of tasks) {
                // Skip the final report task from the per-task summary list
                if (task.title === 'Report final results') continue;
                displayTaskResult(task);
            }
            console.log('────────────────────────────────────');

            // Display final report in green if present
            const finalReportTask = tasks.find(t => t.title === 'Report final results');
            if (finalReportTask && finalReportTask.status === 'success') {
                displayFinalReport(finalReportTask);
            } else if (finalReportTask && finalReportTask.status === 'failed') {
                console.log(`\n${Colors.red}[ERROR] Final report generation failed.${Colors.reset}\n`);
            }

        } catch (err: any) {
            logger.error('Main', `Error: ${err.message}`);
            console.error(`\n[ERROR] ${err.message}\n`);
        }
    }

    // Cleanup
    rl.close();
    checkpoint.close();
    episodic.close();
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
