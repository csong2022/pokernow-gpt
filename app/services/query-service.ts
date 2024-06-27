import { Game } from "../models/game.ts";
import { PlayerAction } from "../models/player-action.ts";
import { Player } from "../models/player.ts";
import { Table } from "../models/table.ts";
import { Queue } from "../utils/data-structures.ts";
import { Street, convertToBB } from "../utils/log-processing-utils.ts";

export function constructQuery(game: Game): string{
    const table = game.getTable();
    const hero_name = game.getHero()!.getName();
    const hero_id = table.getIDFromName(hero_name)!;
    const hero_stack = table.getPlayerStacks().get(hero_id)!;
    const hero_position = table.getPlayerPositions().get(hero_id)!;
    const player_stacks = table.getPlayerStacks();
    const player_positions = table.getPlayerPositions();
    const player_actions = table.getPlayerActions();
    const hero_cards = game.getHero()!.getHand();
    const street = table.getStreet();
    const runout = table.getRunout();
    let query = "";

    query = query.concat(defineObjective(hero_position, hero_stack), '\n');
    query = query.concat(defineHand(hero_cards), '\n');
    query = query.concat(defineGameState(street), '\n');
    query = query.concat(defineCommunityCards(street, runout), '\n')
    query = query.concat(defineStacks(player_stacks, player_positions), '\n');
    query = query.concat(defineActions(player_actions, table), '\n');
    query = query.concat(defineStats(player_positions, table), '\n');
    query = query.concat("Please respond in this format: {action, bet size in BBs}");

    return query
}

export async function postProcessLogs(logs_queue: Queue<Array<string>>, game: Game) {
    const table = game.getTable();
    while (!logs_queue.isEmpty()) {
        const log = logs_queue.dequeue();
        //process player action
        if (log != null) {
            if (!Object.values<string>(Street).includes(log[0])) {
                const player_id = log[0];
                const player_name = log[1];
                const action = log[2];
                const bet_size = log[4];
                let player_action = new PlayerAction(player_id, action, convertToBB(Number(bet_size), game.getStakes()));
                table.updatePlayerActions(player_action);
                await table.cachePlayer(player_id, player_name);
            } else {
                const street = log[0];
                const runout = log[1];
                table.setStreet(street.toLowerCase());
                table.setRunout(runout);
            }
        }
    }
}

function defineObjective(position: string, stack_size: number) {
    return `Help me decide my action in No Limit Hold'em poker. I'm in the ${position} with a stack size of ${stack_size} BBs. `;
}

function defineHand(cards: string[]) {
    let query = "My hole cards are: ";
    for (var i = 0; i < cards.length; i++) {
        query = query.concat(cards[i]);
        if (i != cards.length - 1) {
            query = query.concat(", ");
        }
    }
    return query;
}

function defineGameState(street: string) {
    let query = "The current street is: ";
    if (street) {
        query = query.concat(street);
    } else {
        query = query.concat("preflop")
    }
    return query;
}

function defineCommunityCards(street: string, runout: string): string {
    let query;
    if (street) {
        query = `The current community cards are: ${runout}`;
    } else {
        query = "There are currently no community cards showing."
    }
    return query;
}

export function defineStacks(player_stacks: Map<string, number>, player_positions: Map<string, string>): string {
    let query = "Here are the initial stack sizes of all players involved: \n";
    const player_ids = Array.from(player_positions.keys());
    for (var i = 0; i < player_ids.length; i++)  {
        let curr_id = player_ids[i]
        let pos = player_positions.get(curr_id);
        let stack = player_stacks.get(curr_id);
        query = query.concat(`${pos}: ${stack} BBs`)
        if (i != player_ids.length - 1) {
            query = query.concat(", ");
        }
    }
    return query;
}

export function defineActions(player_actions: Array<PlayerAction>, table: Table) {
    let query = "Here are the current actions that are relevant:\n";
    for (var i = 0; i < player_actions.length; i++)  {
        let player_pos = table.getPositionFromID(player_actions[i].getPlayerId());
        let player_action_string = player_actions[i].toString();
        let curr = `${player_pos} ${player_action_string}`;
        //console.log("current action", curr);
        if (i != player_actions.length - 1) {
            curr = curr.concat(", ");
        }
        query = query.concat(curr);
    }
    return query
}

export function defineStats(player_positions: Map<string, string>, table: Table) {
    let query = "Stats of players in the pot:\n"
    let player_ids = Array.from(player_positions.keys());

    for (var i = 0; i < player_ids.length; i++)  {
        let player_id = player_ids[i]
        let player_stats = table.getPlayerStatsFromId(player_id);
        let player_pos = table.getPositionFromID(player_id);
        let curr = `${player_pos}: VPIP: ${player_stats.computeVPIPStat()}, PFR: ${player_stats.computePFRStat()}`;
        if (i != player_ids.length - 1) {
            curr = curr.concat("\n");
        }
        query = query.concat(curr);
    }
    return query;
}