import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import { createInterface, Interface } from 'readline';
import path from 'path';
import { fileURLToPath } from 'url';

import { EngineAction, ShowdownResult, StateView, TableConfig } from './protocol.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// src/arena/engine -> repo root -> engine-py
const ENGINE_DIR = path.resolve(__dirname, '..', '..', '..', 'engine-py');
const VENV_PYTHON = process.platform === 'win32'
    ? path.join(ENGINE_DIR, '.venv', 'Scripts', 'python.exe')
    : path.join(ENGINE_DIR, '.venv', 'bin', 'python');
const SERVER = path.join(ENGINE_DIR, 'server.py');

interface Pending {
    resolve: (value: any) => void;
    reject: (err: Error) => void;
}

/**
 * Thin spawn + JSON-RPC client for the PokerKit oracle. No poker logic — it
 * only correlates requests/responses and surfaces engine crashes/stderr.
 */
export class PokerKitClient {
    private child!: ChildProcessWithoutNullStreams;
    private rl!: Interface;
    private readonly pending = new Map<number, Pending>();
    private nextId = 1;
    private closed = false;

    start(): void {
        this.child = spawn(VENV_PYTHON, [SERVER], { stdio: ['pipe', 'pipe', 'pipe'] });

        this.rl = createInterface({ input: this.child.stdout });
        this.rl.on('line', (line) => this.onLine(line));

        // Engine diagnostics (incl. PokerKit warnings/tracebacks) go to our stderr.
        createInterface({ input: this.child.stderr }).on('line', (line) => {
            console.error(`[engine] ${line}`);
        });

        this.child.on('exit', (code, signal) => {
            this.closed = true;
            const err = new Error(`engine process exited (code=${code}, signal=${signal})`);
            for (const { reject } of this.pending.values()) reject(err);
            this.pending.clear();
        });
        this.child.on('error', (err) => {
            this.closed = true;
            for (const { reject } of this.pending.values()) reject(err);
            this.pending.clear();
        });
    }

    private onLine(line: string): void {
        const trimmed = line.trim();
        if (!trimmed) return;
        let msg: any;
        try {
            msg = JSON.parse(trimmed);
        } catch {
            console.error(`[engine] non-JSON stdout: ${trimmed}`);
            return;
        }
        const p = this.pending.get(msg.id);
        if (!p) return;
        this.pending.delete(msg.id);
        if (msg.error) p.reject(new Error(`engine RPC error: ${msg.error}`));
        else p.resolve(msg.result);
    }

    private rpc<T>(method: string, params: Record<string, unknown>): Promise<T> {
        if (this.closed) return Promise.reject(new Error('engine process is not running'));
        const id = this.nextId++;
        return new Promise<T>((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            this.child.stdin.write(JSON.stringify({ id, method, params }) + '\n');
        });
    }

    createGame(params: TableConfig & { game_id: string }): Promise<{ game_id: string }> {
        return this.rpc('create_game', { mode: 'cash', ...params });
    }
    startHand(game_id: string, opts: { button?: number; deck?: string } = {}): Promise<StateView> {
        return this.rpc('start_hand', { game_id, ...opts });
    }
    getState(game_id: string): Promise<StateView> {
        return this.rpc('get_state', { game_id });
    }
    applyAction(game_id: string, action: EngineAction): Promise<StateView> {
        return this.rpc('apply_action', { game_id, ...action });
    }
    showdown(game_id: string): Promise<ShowdownResult> {
        return this.rpc('showdown', { game_id });
    }
    endGame(game_id: string): Promise<{ ok: boolean }> {
        return this.rpc('end_game', { game_id });
    }

    stop(): void {
        this.closed = true;
        try { this.child.stdin.end(); } catch { /* ignore */ }
        try { this.child.kill(); } catch { /* ignore */ }
    }
}
