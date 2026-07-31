import crypto from 'crypto';
import { MessagePort } from 'worker_threads';
import { DebugMode } from "../utils/error-handling.util.ts"
import { AIConfig } from "../core/ai/ai-config.interface.ts";

interface BotConfig {
    debug_mode: DebugMode,
    query_retries: number
}

interface WebDriverConfig {
    default_timeout: number,
    headless_flag: boolean,
    // The PokerNow table's action clock in seconds (owner-configurable). The live
    // bot derives its per-decision timing budget from this so decisions finish
    // within the clock.
    action_timer_secs: number
}

export interface WorkerConfig {
    bot_uuid: crypto.UUID,
    game_id: string,
    name: string,
    stack_size: number,
    ai_config: AIConfig,
    bot_config: BotConfig,
    webdriver_config: WebDriverConfig,
    port: MessagePort
}