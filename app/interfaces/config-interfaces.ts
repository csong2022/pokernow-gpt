import { DebugMode } from "../utils/errorhandling-utils.ts"

interface AIConfig {
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
    game_id: string,
    ai_config: AIConfig,
    bot_config: BotConfig,
    webdriver_config: WebDriverConfig
}