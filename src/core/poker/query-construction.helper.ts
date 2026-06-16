// @ts-ignore
import { rankBoard } from "phe";
import { Game } from "../game/game.model.ts";
import { PlayerAction } from "../player/playeraction.model.ts";
import { Table } from "../game/table.model.ts";
import type { HandContextBuilder } from "./hand-context-builder.interface.ts";

const RUNOUT_CARD_RE = /([JQKA]|10|[1-9])([shdc])/g;

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
        "I'll send the state on each of my decision points in this hand. Respond each time with only {action, bet_size_in_BBs BB} — no explanations.",
        "For bet/raise/all-in, set bet_size_in_BBs to the TOTAL bet size for this street (e.g., raising to 3 BB total = 3, not the increment over a previous raise). For call, set it to the amount you're matching (the current outstanding bet). For check/fold, set it to 0.",
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

    const rank_query = defineRank(street, runout, hero_cards);
    if (rank_query) sections.push(rank_query);

    sections.push(defineActions(player_actions, table));
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
        const player_name = table.getNameFromId(player_id);
        if (player_name === hero_name) continue;

        stack_entries.push(`{${player_pos}: ${player_stacks.get(player_id)} BBs}`);
    }

    return "Here are the initial stack sizes of the other players in the pot, defined in the format {position: stack_size_in_BBs}:\n" + stack_entries.join(", ");
}

function defineActions(player_actions: Array<PlayerAction>, table: Table): string {
    const entries = player_actions.map(action =>
        `{${table.getPlayerPositionFromId(action.getPlayerId())} ${action.toString()}}`
    );
    return "Actions this street (position action bet_size_in_BBs):\n" + entries.join(", ");
}