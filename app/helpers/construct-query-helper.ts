import { Game } from "../models/game.ts";
import { PlayerAction } from "../models/player-action.ts";
import { Table } from "../models/table.ts";

export function constructQuery(game: Game): string{
    const table = game.getTable();

    const street = table.getStreet();
    const runout = table.getRunout();

    const hero_name = game.getHero()!.getName();
    const hero_id = table.getIdFromName(hero_name);
    const hero_stack = game.getHero()!.getStackSize();
    const hero_position = table.getPlayerPositionFromId(hero_id);
    const hero_cards = game.getHero()!.getHand();

    const players_in_pot = table.getPlayersInPot();
    const player_stacks = table.getPlayerInitialStacks();
    const player_actions = table.getPlayerActions();
    const player_positions = table.getPlayerPositions();

    let query = "";

    query = query.concat(defineObjective(hero_position, hero_stack), '\n');
    query = query.concat(defineGameState(street, players_in_pot), '\n');
    query = query.concat(defineCommunityCards(street, runout), '\n')
    query = query.concat(defineHand(hero_cards), '\n');
    query = query.concat(defineStacks(player_stacks, player_positions), '\n');
    query = query.concat(defineActions(player_actions, table), '\n');
    query = query.concat(defineStats(player_positions, table), '\n');
    query = query.concat(defineOutput());

    return query;
}

function defineObjective(position: string, stack_size: number): string {
    return `Help me decide my action in No Limit Hold'em poker. I'm in the ${position} position with a stack size of ${stack_size} BBs.`;
}

function defineGameState(street: string, players_in_pot: number): string {
    return `It is ${players_in_pot}-handed and the current street is: ${street ? street : "preflop"}.`
}

function defineCommunityCards(street: string, runout: string): string {
    let query;
    if (street && runout) {
        runout = runout.replace("[", "");
        runout = runout.replace("]", "");
        query = `The current community cards are: ${runout}`;
    } else {
        query = "There are currently no community cards showing."
    }
    return query;
}

function defineHand(cards: string[]): string {
    let query = "My hole cards are: ";
    for (var i = 0; i < cards.length; i++) {
        query = query.concat(cards[i]);
        if (i != cards.length - 1) {
            query = query.concat(", ");
        }
    }
    return query;
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

function defineActions(player_actions: Array<PlayerAction>, table: Table): string {
    let query = "Here are the previous actions in this hand, defined in the format {position action bet_size_in_BBs}:\n";
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

function defineStats(player_positions: Map<string, string>, table: Table): string {
    let query = "Here are the stats of players in the pot, defined in the format {position: VPIP: vpip_stat, PFR: pfr_stat}:\n"
    let player_ids = Array.from(player_positions.keys());

    for (var i = 0; i < player_ids.length; i++)  {
        let player_id = player_ids[i]
        let player_stats = table.getPlayerStatsFromId(player_id);
        let player_pos = table.getPlayerPositionFromId(player_id);
        let curr = `{${player_pos}: VPIP: ${player_stats.computeVPIPStat()}, PFR: ${player_stats.computePFRStat()}}`;
        if (i != player_ids.length - 1) {
            curr = curr.concat("\n");
        }
        query = query.concat(curr);
    }
    return query;
}

function defineOutput(): string {
    return "Do not provide an explanation, respond in this format: {action,bet_size_in_BBs}";
}