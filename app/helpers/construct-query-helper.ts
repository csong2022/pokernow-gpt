import { Game } from "../models/game.ts";
import { PlayerAction } from "../models/player-action.ts";
import { Table } from "../models/table.ts";
import { suitToLetter } from "../utils/log-processing-utils.ts";

export function constructQuery(game: Game): string{
    const table = game.getTable();

    const street = table.getStreet();
    const runout = table.getRunout();

    const hero_id = game.getHero()!.getPlayerId();
    const hero_name = table.getNameFromId(hero_id);
    const hero_stack = game.getHero()!.getStackSize();
    const hero_position = table.getPlayerPositionFromId(hero_id);
    const hero_cards = game.getHero()!.getHand();

    const players_in_pot = table.getPlayersInPot();
    const player_stacks = table.getPlayerInitialStacks();
    const pot_size = table.getPot();
    const player_actions = table.getPlayerActions();
    const player_positions = table.getPlayerPositions();

    let query = "";

    query = query.concat(defineObjective(hero_position, hero_stack), '\n');
    query = query.concat(defineGameState(street, players_in_pot), '\n');
    query = query.concat(defineCommunityCards(street, runout), '\n')
    query = query.concat(defineHand(hero_cards), '\n');
    query = query.concat(defineStacks(player_stacks, player_positions), '\n');
    query = query.concat(definePotSize(pot_size), `\n`);
    query = query.concat(defineActions(player_actions, table), '\n');
    query = query.concat(defineStats(player_positions, table, hero_name), '\n');
    query = query.concat(defineOutput());

    return query;
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
        runout = Array.from(suitToLetter.entries()).reduce((prev, entry) => prev.replaceAll(...entry), runout);
        query = `The current community cards are: ${runout}`;
    } else {
        query = "There are currently no community cards showing."
    }
    return query;
}

function defineHand(cards: string[]): string {
    return `My hole cards are: ${cards.join(", ")}`;
}

function defineStacks(player_stacks: Map<string, number>, player_positions: Map<string, string>): string {
    let query = "Here are the initial stack sizes of all players involved, defined in the format {position: stack_size_in_BBs}:\n";
    const player_ids = Array.from(player_positions.keys());
    for (var i = 0; i < player_ids.length; i++)  {
        let curr_id = player_ids[i]
        let pos = player_positions.get(curr_id);
        let stack = player_stacks.get(curr_id);
        query = query.concat(`{${pos}: ${stack} BBs}`)
        if (i != player_ids.length - 1) {
            query = query.concat(", ");
        }
    }
    return query;
}

function definePotSize(pot_size_in_BBs: number): string {
    return `The current pot size before any actions were made in the street is ${pot_size_in_BBs} BB.`;
}

function defineActions(player_actions: Array<PlayerAction>, table: Table): string {
    let query = "Here are the previous actions in this street, defined in the format {position action bet_size_in_BBs}:\n";
    for (var i = 0; i < player_actions.length; i++)  {
        let player_pos = table.getPlayerPositionFromId(player_actions[i].getPlayerId());
        let player_action_string = player_actions[i].toString();
        let curr = `{${player_pos} ${player_action_string}}`;
        if (i != player_actions.length - 1) {
            curr = curr.concat(", ");
        }
        query = query.concat(curr);
    }
    return query
}

function defineStats(player_positions: Map<string, string>, table: Table, hero_name: string): string {
    let query = "Here are the stats of players in the pot, defined in the format {position: Total Hands Played = total_hands, VPIP = vpip_stat, PFR = pfr_stat}:\n"
    let player_ids = Array.from(player_positions.keys());

    for (var i = 0; i < player_ids.length; i++)  {
        const player_id = player_ids[i];
        const player_name = table.getNameFromId(player_id);
        if (player_name === hero_name) {
            continue;
        }
        const player_stats = table.getPlayerStatsFromName(player_name);
        const player_pos = table.getPlayerPositionFromId(player_id);
        let curr = `{${player_pos}: Total Hands Played = ${player_stats.getTotalHands()}, VPIP = ${player_stats.computeVPIPStat().toFixed(2)}, PFR = ${player_stats.computePFRStat().toFixed(2)}}`;
        if (i != player_ids.length - 1) {
            curr = curr.concat("\n");
        }
        query = query.concat(curr);
    }
    return query;
}

function defineOutput(): string {
    return "Do not provide an explanation, respond in this format: {action, bet_size_in_BBs BB}";
}