import { appendFileSync, mkdirSync } from 'fs';
import path from 'path';

// Append-only JSONL writer. Each line is one complete, replayable hand record:
// config, full hole cards, board, ordered actions, pots, winners, per-seat stack
// deltas, and malformed-action events. This is the analysis corpus.
export class HandLog {
    constructor(private readonly filePath: string) {
        mkdirSync(path.dirname(filePath), { recursive: true });
    }

    write(record: Record<string, unknown>): void {
        appendFileSync(this.filePath, JSON.stringify(record) + '\n');
    }
}
