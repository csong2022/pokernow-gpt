// Reasoning/thinking effort a model is asked to use. "none" = off / not a
// reasoning model. The model registry stores this per model; the AI services map
// it to each provider's native knob (OpenAI reasoning_effort, Anthropic adaptive
// thinking + effort). Lives here so both core types and the registry share it.
export type ReasoningLevel = 'none' | 'low' | 'medium' | 'high';

// Shared AI configuration for a seat/bot: which provider, model, playstyle, and
// reasoning effort. Lives in core because it's environment-agnostic — both the
// live bot and arena agents need it, and core must not import live's interfaces.
export interface AIConfig {
    provider: string,
    model_name: string,
    playstyle: string,
    reasoning?: ReasoningLevel,
    // Optional raw system-prompt override. When set, it REPLACES the playstyle
    // prompt (used for arena probe-only experiments); otherwise the playstyle map
    // is used. Live/normal runs leave it unset, so existing behavior is unchanged.
    systemPrompt?: string
}
