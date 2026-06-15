// Shared AI configuration for a seat/bot: which provider, model, and playstyle.
// Lives in core because it's environment-agnostic — both the live bot and arena
// agents need it, and core must not import live's interface files.
export interface AIConfig {
    provider: string,
    model_name: string,
    playstyle: string
}
