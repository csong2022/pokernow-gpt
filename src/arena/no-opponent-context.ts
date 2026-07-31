import { Game } from "../core/game/game.model.ts";
import type { HandContextBuilder } from "../core/poker/hand-context-builder.interface.ts";

// Arena context: NO opponent-history section, by construction. There is deliberately
// no code path here that reads opponent stats, so an arena agent is a pure function
// of current hand state. This is load-bearing twice: duplicate-deck variance
// cancellation needs identical replays (an agent conditioning on accumulated reads
// wouldn't replay identically), and cross-run comparability needs bb/100 to be
// attributable to the model, not to adaptation against a field.
//
// A future opponent-aware arena arm (the deliberate exploitation experiment) is a
// matter of injecting a different builder for that arm — not a flag flipped here.
export class NoOpponentContext implements HandContextBuilder {
    buildOpponentSection(_game: Game): string {
        return "";
    }
}
