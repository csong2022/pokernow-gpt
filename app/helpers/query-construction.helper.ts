// @ts-ignore
import { rankBoard } from "phe";
import { Game } from "../models/game.model.ts";
import { PlayerAction } from "../models/playeraction.model.ts";
import { Table } from "../models/table.model.ts";

const RUNOUT_CARD_RE = /([JQKA]|10|[1-9])([shdc])/g;

export function constructQuery(game: Game): string {
    const table = game.getTable();

    const street = table.getStreet();
    const runout = table.getRunout();

    const hero_id = game.getHero()!.getPlayerId();
    const hero_name = table.getNameFromId(hero_id);
    const hero_stack = game.getHero()!.getStackSize();
    const hero_position = table.getPlayerPositionFromId(hero_id);
    const hero_cards = game.getHero()!.getHand();

    const num_players = table.getNumPlayers();
    const player_stacks = table.getPlayerInitialStacks();
    const pot_size = table.getPot();
    const player_actions = table.getPlayerActions();
    const player_positions = table.getPlayerPositions();

    const { stacks_section, stats_section } = defineStacksAndStats(player_positions, player_stacks, table, hero_id, hero_name);

    const sections: string[] = [
        defineObjective(hero_position, hero_stack),
        defineGameState(street, num_players),
        defineCommunityCards(street, runout),
        defineHand(hero_cards),
    ];

    const rank_query = defineRank(street, runout, hero_cards);
    if (rank_query) sections.push(rank_query);

    sections.push(
        stacks_section,
        definePotSize(pot_size),
        defineActions(player_actions, table),
        stats_section,
        defineOutput()
    );

    return sections.join('\n');
}

function defineObjective(position: string, stack_size: number): string {
    return `Help me decide my action in No Limit Hold'em poker. I'm in the ${position} position with a stack size of ${stack_size} BB.`;
}

function defineGameState(street: string, players_in_pot: number): string {
    return `It is ${players_in_pot}-handed, and the current street is: ${street ? street : "preflop"}.`
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

function defineStacksAndStats(
    player_positions: Map<string, string>,
    player_stacks: Map<string, number>,
    table: Table,
    hero_id: string,
    hero_name: string
): { stacks_section: string, stats_section: string } {
    const stack_entries: string[] = [];
    const stat_entries: string[] = [];

    for (const player_id of player_positions.keys()) {
        if (player_id === hero_id) continue;
        const player_pos = player_positions.get(player_id);
        const player_name = table.getNameFromId(player_id);
        if (player_name === hero_name) continue;

        stack_entries.push(`{${player_pos}: ${player_stacks.get(player_id)} BBs}`);

        const player_stats = table.getPlayerStatsFromName(player_name);
        stat_entries.push(
            `{${player_pos}: Total Hands Played = ${player_stats.getTotalHands()}, VPIP = ${player_stats.computeVPIPStat().toFixed(2)}, PFR = ${player_stats.computePFRStat().toFixed(2)}}`
        );
    }

    return {
        stacks_section: "Here are the initial stack sizes of the other players in the pot, defined in the format {position: stack_size_in_BBs}:\n" + stack_entries.join(", "),
        stats_section: "Here are the stats of the other players in the pot, defined in the format {position: Total Hands Played = total_hands, VPIP = vpip_stat, PFR = pfr_stat}:\n" + stat_entries.join("\n"),
    };
}

function definePotSize(pot_size_in_BBs: number): string {
    return `The current pot size before any actions were made in the street is ${pot_size_in_BBs} BB.`;
}

function defineActions(player_actions: Array<PlayerAction>, table: Table): string {
    const entries = player_actions.map(action =>
        `{${table.getPlayerPositionFromId(action.getPlayerId())} ${action.toString()}}`
    );
    return "Here are the previous actions in this street, defined in the format {position action bet_size_in_BBs}:\n" + entries.join(", ");
}

function defineOutput(): string {
    return "Do not provide an explanation, respond in this format: {action, bet_size_in_BBs BB}";
}