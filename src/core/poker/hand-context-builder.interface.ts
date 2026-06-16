import { Game } from "../game/game.model.ts";

// Per-environment seam for the ONE input that differs between environments: whether
// opponent-history features (VPIP/PFR, ...) are assembled into the hand-setup prompt.
//
// query-construction and the decision loop stay single-sourced and consume this
// port; they never read opponent history themselves. Live injects a builder that
// reads the table's stats (the exploitative thesis); the arena injects a no-op so
// its agents are a pure function of current hand state BY CONSTRUCTION — there is
// no code path that reads opponent history, so it cannot silently regress.
export interface HandContextBuilder {
    // The opponent-modeling section for the hand-setup prompt, or "" when the
    // environment exposes no opponent history.
    buildOpponentSection(game: Game): string;
}
