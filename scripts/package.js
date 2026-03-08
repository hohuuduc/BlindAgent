// scripts/package.js
// Build automation script for packaging BlindAgent with caxa.
// Usage: node scripts/package.js

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const BUILD_DIR = path.join(ROOT, 'build');
const OUTPUT_NAME = 'blindagent';

// Platform-specific output extension
const isWin = process.platform === 'win32';
const OUTPUT_FILE = path.join(BUILD_DIR, `${OUTPUT_NAME}${isWin ? '.exe' : ''}`);

function run(cmd, label) {
    console.log(`\n[STEP] ${label}...`);
    console.log(`  > ${cmd}`);
    try {
        execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
    } catch (err) {
        console.error(`\n[ERROR] ${label} failed!`);
        process.exit(1);
    }
}

function main() {
    console.log('========================================');
    console.log('  BlindAgent Packaging Tool');
    console.log('========================================');

    // Step 1: Compile TypeScript
    run('npx tsc', 'Compiling TypeScript');

    // Step 2: Ensure build output directory
    if (!fs.existsSync(BUILD_DIR)) {
        fs.mkdirSync(BUILD_DIR, { recursive: true });
    }

    // Step 3: Remove old build if exists
    if (fs.existsSync(OUTPUT_FILE)) {
        fs.unlinkSync(OUTPUT_FILE);
        console.log(`  Removed old build: ${OUTPUT_FILE}`);
    }

    // Step 4: Package with caxa
    // Exclude dev-only directories to reduce binary size
    const excludePatterns = [
        '.git',
        'src',
        'tests',
        'log',
        'data',
        '.agent',
        'build',
        'scripts',
        '.gitignore',
        'tsconfig.json',
        'vitest.config.ts',
        'package-lock.json',
        'README.md',
    ];

    const excludeArgs = excludePatterns
        .map(p => `--exclude "${p}"`)
        .join(' ');

    const caxaCmd = [
        'npx caxa',
        `--input "."`,
        `--output "${OUTPUT_FILE}"`,
        excludeArgs,
        `-- "{{caxa}}/node_modules/.bin/node" "{{caxa}}/dist/index.js"`,
    ].join(' ');

    run(caxaCmd, 'Packaging with caxa');

    // Step 5: Report result
    if (fs.existsSync(OUTPUT_FILE)) {
        const stats = fs.statSync(OUTPUT_FILE);
        const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
        console.log('\n========================================');
        console.log('  Build Complete!');
        console.log(`  Output:  ${OUTPUT_FILE}`);
        console.log(`  Size:    ${sizeMB} MB`);
        console.log('========================================\n');
    } else {
        console.error('\n[ERROR] Build output not found!');
        process.exit(1);
    }
}

main();
