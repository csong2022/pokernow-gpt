import crypto from 'crypto';
import { DebugMode } from "../utils/errorhandling-utils.ts"

export interface AIConfig {
    provider: string,
    model_name: string,
    playstyle: string
}

interface BotConfig {
    debug_mode: DebugMode,
    query_retries: number
}

interface WebDriverConfig {
    default_timeout: number,
    headless_flag: boolean
}

export interface WorkerConfig {
    bot_uuid: crypto.UUID,
    game_id: string,
    name: string,
    stack_size: number,
    ai_config: AIConfig,
    bot_config: BotConfig,
    webdriver_config: WebDriverConfig
}