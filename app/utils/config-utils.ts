import { DebugMode } from "./error-handling-utils.ts"

export interface BotConfig {
    debug_mode: DebugMode,
    query_retries: number
}

export interface WebDriverConfig {
    default_timeout: number,
    headless_flag: boolean
}