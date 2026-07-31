// Per-bot logger that prefixes every line with `[<short_uuid> <model_name>]`.
// Multiple bots in the same process write to the same stdout — without a
// prefix their lines interleave indistinguishably during multi-model runs.

export class Logger {
    private readonly prefix: string;

    constructor(bot_uuid: string, model_name: string) {
        const short_uuid = bot_uuid.slice(0, 4);
        this.prefix = `[${short_uuid} ${model_name}]`;
    }

    info(...args: unknown[]): void {
        console.log(this.prefix, ...args);
    }

    warn(...args: unknown[]): void {
        console.warn(this.prefix, ...args);
    }

    error(...args: unknown[]): void {
        console.error(this.prefix, ...args);
    }
}
