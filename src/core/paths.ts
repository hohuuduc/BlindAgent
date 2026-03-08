// src/core/paths.ts
// Path resolution utility for both development and packaged (caxa) modes.
// In caxa mode, bundled assets are extracted to a temp directory.
// Runtime data (databases, logs) always lives in the current working directory.

import * as path from 'path';

/**
 * Detect if running inside a caxa-packaged executable.
 * Caxa injects the extraction path as the first non-node, non-script argument.
 * The extraction path contains a '{{caxa}}' marker directory.
 */
function detectCaxaRoot(): string | null {
    // Caxa sets the command as: "<extract>/node_modules/.bin/node" "<extract>/dist/index.js"
    // So __dirname will be inside the extraction path when packaged.
    // We detect this by checking for the caxa sentinel directory.
    for (const arg of process.argv) {
        // Caxa extraction paths contain a directory with the app's name
        // The __dirname approach is more reliable
        if (arg.includes('.caxa')) {
            return path.dirname(path.dirname(arg));
        }
    }

    // Alternative detection: check if __dirname is inside a temp/caxa path
    const mainScript = require.main?.filename ?? '';
    if (mainScript.includes('.caxa')) {
        // Go up from dist/index.js to the app root
        return path.dirname(path.dirname(mainScript));
    }

    return null;
}

// Cache the detected root on first call
let _appRoot: string | null = null;
let _detected = false;

/**
 * Returns the application root directory.
 * - In caxa mode: the temporary extraction directory (contains dist/, skills/, node_modules/, etc.)
 * - In dev mode: the project root (parent of dist/)
 */
export function getAppRoot(): string {
    if (!_detected) {
        _appRoot = detectCaxaRoot();
        _detected = true;
    }

    if (_appRoot) {
        return _appRoot;
    }

    // Dev mode: __dirname is <project>/dist/core, go up two levels
    return path.resolve(__dirname, '..', '..');
}

/**
 * Returns the working directory for runtime data (databases, logs, user config).
 * Always the current working directory where the user launched the executable.
 */
export function getWorkDir(): string {
    return process.cwd();
}

/**
 * Check if running in packaged (caxa) mode.
 */
export function isPackaged(): boolean {
    if (!_detected) {
        _appRoot = detectCaxaRoot();
        _detected = true;
    }
    return _appRoot !== null;
}
