// The domain's representation of a decision at the table: what to do, and for
// sizing actions how much — in BIG BLINDS, as the TOTAL bet for the street.
//
// This lives in core/poker rather than core/ai because it is a poker concept,
// not an AI-client one. It began life next to the AIService port (it is query()'s
// return type), but its consumers reach well past that port: the live
// action-executor performs one at the table and the arena agent maps one onto
// the engine's legal actions, neither of which cares that a model produced it.
// Same reasoning that put the Action enum here — shared vocabulary belongs in the
// poker layer so live and arena don't import it through the AI abstraction.
export interface BotAction {
    action_str: string,
    bet_size_in_BBs: number
}
