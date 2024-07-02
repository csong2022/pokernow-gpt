import { DebugMode } from "../utils/error-handling-utils.ts"

export interface AIConfig {
    provider: string,
    model_name: string,
    playstyle: string
}

export interface BotConfig {
    debug_mode: DebugMode,
    query_retries: number
}

export interface WebDriverConfig {
    default_timeout: number,
    headless_flag: boolean
}