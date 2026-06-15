import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

import { HandRecord } from './types.ts';

// Parse JSONL text into hand records. Pure (no fs), so it's directly unit-testable.
// Blank lines are skipped; a malformed line fails loudly with its line number.
export function parseHandLogs(text: string): HandRecord[] {
    const records: HandRecord[] = [];
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        try {
            records.push(JSON.parse(line) as HandRecord);
        } catch (err) {
            throw new Error(`Failed to parse JSONL line ${i + 1}: ${(err as Error).message}`);
        }
    }
    return records;
}

// Load hand records from a .jsonl file, or concatenate every .jsonl in a directory.
export function loadHandLogs(fileOrDir: string): HandRecord[] {
    const stat = statSync(fileOrDir);
    if (stat.isDirectory()) {
        const files = readdirSync(fileOrDir).filter((f) => f.endsWith('.jsonl')).sort();
        return files.flatMap((f) => parseHandLogs(readFileSync(join(fileOrDir, f), 'utf8')));
    }
    return parseHandLogs(readFileSync(fileOrDir, 'utf8'));
}
