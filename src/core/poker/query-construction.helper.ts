// @ts-ignore
import { rankBoard } from "phe";
import { Game } from "../game/game.model.ts";
import { PlayerAction } from "../player/playeraction.model.ts";
import { Table } from "../game/table.model.ts";
import type { HandContextBuilder } from "./hand-context-builder.interface.ts";

const RUNOUT_CARD_RE = /([JQKA]|10|[1-9])([shdc])/g;

// Sent once when a reply has no parseable "Final Answer:" line — a one-shot
// re-prompt asking only for the correctly formatted final line (Kaggle POKER_RETHINK).
export const RETHINK_PROMPT = "I couldn't parse an action from your reply. Respond with ONLY the final line in this exact format: `Final Answer: <action> <size>` — <action> is one of fold, check, call, bet, raise, all-in; <size> in BIG BLINDS (TOTAL street bet) only for bet/raise/all-in.";

// Sent once at the start of each hand — contains the state that stays fixed mid-hand
// (position, hole cards, opponent initial stacks, table size). Any opponent-history
// section is supplied by the injected HandContextBuilder; this function does not
// know whether such a section exists — it just inserts whatever the builder returns
// (omitting it when empty), so live and arena share this code unchanged.
export function constructHandSetup(game: Game, contextBuilder: HandContextBuilder): string {
    const table = game.getTable();

    const hero_id = game.getHero()!.getPlayerId();
    const hero_position = table.getPlayerPositionFromId(hero_id);
    const hero_cards = game.getHero()!.getHand();

    const num_players = table.getNumPlayers();
    const player_stacks = table.getPlayerInitialStacks();
    const player_positions = table.getPlayerPositions();

    const stacks_section = defineStacks(player_positions, player_stacks, table, hero_id);
    const opponent_section = contextBuilder.buildOpponentSection(game);

    const sections: string[] = [
        `New No Limit Hold'em hand. I'm in the ${hero_position} position. It is ${num_players}-handed.`,
        defineHand(hero_cards),
        stacks_section,
    ];
    if (opponent_section) sections.push(opponent_section);
    sections.push(
        "I'll send the state at each of your decision points this hand. First reason briefly about the spot — your hand vs the opponents' likely ranges, board texture, position, stack depth/SPR, and your plan — then end your reply with a single final line in EXACTLY this format:",
        "Final Answer: <action> <size>",
        "where <action> is one of fold, check, call, bet, raise, all-in. Give <size> only for bet/raise/all-in, in BIG BLINDS, as the TOTAL bet for this street (e.g. raising to 3 BB total -> `Final Answer: raise 3`, not the increment over a previous bet); for call use the amount you're matching; for check/fold omit it. The `Final Answer:` line must come last.",
    );
    return sections.join('\n');
}

// Sent on every bot turn — just what has changed since the last turn.
export function constructTurnUpdate(game: Game): string {
    const table = game.getTable();

    const street = table.getStreet();
    const runout = table.getRunout();
    const hero_cards = game.getHero()!.getHand();
    const hero_stack = game.getHero()!.getStackSize();
    const pot_size = table.getPot();
    const player_actions = table.getPlayerActions();

    const sections: string[] = [
        `Street: ${street ? street : "preflop"}. My stack: ${hero_stack} BB. Pot: ${pot_size} BB.`,
        defineCommunityCards(street, runout),
    ];

    const hero_id = game.getHero()!.getPlayerId();
    const positions = table.getPlayerPositions();
    const live_players = table.getLivePlayers();
    const live_set = live_players ? new Set(live_players) : null;

    // Opponents' CURRENT stacks (BB) when supplied, for effective-stack reasoning
    // (live opponents only). Omitted when the environment doesn't provide them.
    const current_stacks = table.getCurrentStacks();
    if (current_stacks) {
        const entries: string[] = [];
        for (const player_id of positions.keys()) {
            if (player_id === hero_id) continue;
            if (live_set && !live_set.has(player_id)) continue; // skip folded players
            const stack = current_stacks.get(player_id);
            if (stack != null) entries.push(`${positions.get(player_id)}: ${stack} BB`);
        }
        if (entries.length > 0) sections.push(`Opponent stacks now: {${entries.join(", ")}}`);
    }

    // Who's still in the hand — only meaningful with 3+ players (HU is implied).
    if (live_players && table.getNumPlayers() > 2) {
        const labels = live_players.map((id) => positions.get(id)).filter((p): p is string => p != null);
        if (labels.length > 0) sections.push(`Players still in the hand: ${labels.join(", ")}.`);
    }

    const rank_query = defineRank(street, runout, hero_cards);
    if (rank_query) sections.push(rank_query);

    sections.push(defineActions(player_actions, table));

    // Surface the exact amount to call when the environment provides it (omitted
    // otherwise, e.g. live until wired, so those prompts stay unchanged).
    const amount_to_call = table.getAmountToCall();
    if (amount_to_call != null && amount_to_call > 0) {
        sections.push(`To call: ${amount_to_call} BB.`);
    }

    // Legal raise band (TOTAL bet sizes, in BB) when raising is allowed — so the
    // model picks a legal size instead of guessing and getting clamped.
    const min_raise_to = table.getMinRaiseTo();
    const max_raise_to = table.getMaxRaiseTo();
    if (min_raise_to != null && max_raise_to != null) {
        sections.push(`If raising, the total must be between ${min_raise_to} and ${max_raise_to} BB.`);
    }

    sections.push("What's my action?");

    return sections.join('\n');
}

function defineCommunityCards(street: string, runout: string): string {
    let query;
    if (street && runout) {
        query = `The current community cards are: ${runout}`;
    } else {
        query = "There are currently no community cards showing."
    }
    return query;
}

function defineHand(hero_cards: string[]): string {
    return `My hole cards are: ${hero_cards.join(", ")}`;
}

export function defineRank(street: string, runout: string, hero_cards: string[]): string {
    if (!street) {
        return '';
    }
    let query = "The combination of the community cards and hand is: ";
    const cards = replaceTenWithLetter(hero_cards.concat(convertRunoutToCards(runout)));
    const rank_num = rankBoard(cards.join(" "));
    switch (rank_num) {
        case 0:
            query = query.concat("STRAIGHT_FLUSH");
            break;
        case 1:
            query = query.concat("FOUR_OF_A_KIND");
            break;
        case 2:
            query = query.concat("FULL_HOUSE");
            break;
        case 3:
            query = query.concat("FLUSH");
            break;
        case 4:
            query = query.concat("STRAIGHT");
            break;
        case 5:
            query = query.concat("THREE_OF_A_KIND");
            break;
        case 6:
            query = query.concat("TWO_PAIR");
            break;
        case 7:
            query = query.concat("ONE_PAIR");
            break;
        case 8:
            query = query.concat("HIGH_CARD");
            break;
    }
    return query;
}

function convertRunoutToCards(runout: string): string[] {
    const res = new Array<string>;
    for (const element of runout.matchAll(RUNOUT_CARD_RE)) {
        res.push(element[1] + element[2]);
    }
    return res;
}

function replaceTenWithLetter(cards: string[]): string[] {
    return cards.map((card) => {
        if (card.length === 3) {
            return 'T' + card[2];
        }
        return card;
    });
}

// Opponent initial stacks = current hand state, shared by every environment. The
// opponent STATS section (opponent history) is environment-specific and lives in a
// HandContextBuilder instead.
function defineStacks(
    player_positions: Map<string, string>,
    player_stacks: Map<string, number>,
    table: Table,
    hero_id: string
): string {
    const hero_name = table.getNameFromId(hero_id);
    const stack_entries: string[] = [];

    for (const player_id of player_positions.keys()) {
        if (player_id === hero_id) continue;
        const player_pos = player_positions.get(player_id);
        // Skip opponents we can't resolve (e.g. a rebought/new id not yet in the
        // current maps) rather than throwing and aborting the whole decision.
        const player_name = table.tryGetNameFromId(player_id);
        if (!player_name || player_name === hero_name) continue;

        stack_entries.push(`{${player_pos}: ${player_stacks.get(player_id)} BBs}`);
    }

    return "Here are the initial stack sizes of the other players in the pot, defined in the format {position: stack_size_in_BBs}:\n" + stack_entries.join(", ");
}

function defineActions(player_actions: Array<PlayerAction>, table: Table): string {
    const entries = player_actions
        // Omit actions from players we can't position (e.g. a rebought/new id not yet
        // in the maps) rather than throwing and aborting the decision.
        .map(action => {
            const pos = table.tryGetPositionFromId(action.getPlayerId());
            return pos ? `{${pos} ${action.toString()}}` : null;
        })
        .filter((entry): entry is string => entry !== null);
    return "Actions this street (position action bet_size_in_BBs):\n" + entries.join(", ");
}