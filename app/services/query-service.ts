import { Game } from "../models/game.ts";
import { PlayerAction } from "../models/player-action.ts";
import { Player } from "../models/player.ts";
import { Table } from "../models/table.ts";
import { Queue } from "../utils/data-structures.ts";
import { Street, convertToBB } from "../utils/log-processing-utils.ts";

export async function constructQuery(street: string, stack_size: number, ) {
    
}

export function postProcessLogs(logs_queue: Queue<Array<string>>, game: Game) {
    const table = game.getTable();
    while (!(logs_queue.isEmpty())) {
        //console.log(logs_queue);
        const log = logs_queue.dequeue();
        //process player action
        if (log != null) {
            if (!Object.values<string>(Street).includes(log[0])) {
                let player_action = new PlayerAction(log[0], log[2], convertToBB(Number(log[4]), game.getStakes()));
                table.updatePlayerActions(player_action);
            } else {
                table.setStreet(log[0].toLowerCase());
                table.setRunout(log[1]);
            }
        }
    }
}

function defineObjective(position: string, stack_size: number) {
    return `Help me decide my action in No Limit Holdem poker. 
            My position is ${position} and I have a stack size of ${stack_size} bbs.`;
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

function defineGameState(street: string, num_players: number, pot_in_BBs: number) {
    return `The current street is ${street} and it is ${num_players}-handed. The pot is ${pot_in_BBs} BB.`;
}

function defineCommunityCards(street: string, runout: string): string {
    let query;
    if (street === "preflop") {
        query = "There are currently no community cards showing."
    } else {
        query = `The current community cards are: ${runout}`;
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
        let player_stats = table.getPlayerStatsFromId(player_id)
        let player_pos = table.getPositionFromID(player_id);
        let curr = `${player_pos}: VPIP: ${player_stats.computeVPIPStat()}, PFR: ${player_stats.computePFRStat()}`;
        if (i != player_ids.length - 1) {
            curr = curr.concat("\n");
        }
        query = query.concat(curr);
    }
    return query;
}