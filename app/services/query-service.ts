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
        if (log != null && !(Object.values<string>(Street).includes(log[0]))) {
            let player_action = new PlayerAction(log[0], log[2], convertToBB(Number(log[4]), game.getStakes()));
            table.updatePlayerActions(player_action);
        }
    }
}

function defineObjective(position: string, stack_size: number) {
    return `Help me decide my action in No Limit Holdem poker. 
            My position is ${position} and I have a stack size of ${stack_size} bbs.`;
}

function defineHand(cards: string[]) {
    return appendCards("My hole cards are: ", cards);
}

function defineGameState(street: string, num_players: number, pot_in_BBs: number) {
    return `The current street is ${street} and it is ${num_players}-handed. The pot is ${pot_in_BBs} BB.`;
}

function defineCommunityCards(street: string, cards: string[]): string {
    let query;
    if (street === "preflop") {
        query = "There are currently no community cards showing."
    } else {
        query = appendCards("The current community cards are: ", cards);
    }
    return query;
}

function appendCards(query: string, cards: string[]): string {
    for (var i = 0; i < cards.length; i++) {
        query = query.concat(cards[i]);
        if (i != cards.length - 1) {
            query = query.concat(", ");
        }
    }
    return query;
}

export function defineActions(table: Table) {
    let query = "Here are the current actions that are relevant:\n";
    const player_actions = table.getPlayerActions();
    for (var i = 0; i < player_actions.length; i++)  {
        console.log("player_action indexed", player_actions[i]);
        let player_pos = table.getPositionFromID(player_actions[i].getPlayerId());
        console.log("player position", player_pos);
        let player_action_string = player_actions[i].toString();
        console.log("player action", player_action_string);
        let curr = `${player_pos} ${player_action_string}`;
        //console.log("current action", curr);
        if (i != player_actions.length - 1) {
            curr = curr.concat(", ");

        }
        query = query.concat(curr);
    }
    return query
}

export function defineStats(table: Table) {
    let query = "Stats of players in the pot:\n"
    let cache = table.getPlayerCache();
    let player_ids = Array.from(table.getPlayerPositions().keys());

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