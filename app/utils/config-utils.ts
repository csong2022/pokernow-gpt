import { DebugMode } from "./error-handling-utils.ts"
export interface BotConfig {
    debug_mode: DebugMode,
    query_retries: number
}