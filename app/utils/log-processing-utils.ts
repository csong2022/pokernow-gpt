import { Game } from "../models/game.ts";
import { PlayerAction } from "../models/player-action.ts";
import { Queue } from "./data-structures.ts";
import { convertToBBs } from "./value-conversion-utils.ts";

export enum Action {
    BET = "bets",
    CALL = "calls",
    FOLD = "folds",
    RAISE = "raises",
    POST = "posts",
    CHECK = "checks",
}

export enum Street {
    PREFLOP = "Preflop",
    FLOP = "Flop",
    TURN = "Turn",
    RIVER = "River",
}

export const suitToLetter: Map<string, string> = new Map<string, string>([
    ["♠", "s"],
    ["♥", "h"],
    ["♦", "d"],
    ["♣", "c"]
]);

export function preProcessLogs(logs: Array<Array<string>>, game: Game) {
    const table = game.getTable();
    logs = logs.reverse();
    logs.forEach((element) => {
        if (element[2] === 'posts' && element[4] === game.getSmallBlind().toString()) {
            table.setFirstSeatOrderId(element[0]);
        }
        table.updateLogsQueue(element);
    })
}

export async function postProcessLogs(logs_queue: Queue<Array<string>>, game: Game) {
    const table = game.getTable();
    while (!logs_queue.isEmpty()) {
        const log = logs_queue.dequeue();
        //process player action
        if (log != null) {
            if (!Object.values<string>(Street).includes(log[0])) {
                const player_id = log[0];
                const action = log[2];
                const bet_size = log[4];
                if (action === "folds") {
                    table.decrementPlayersInPot();
                }
                let player_action = new PlayerAction(player_id, action, convertToBBs(Number(bet_size), game.getBigBlind()));
                table.updatePlayerActions(player_action);
            } else {
                const street = log[0];
                const runout = log[1];
                table.setStreet(street.toLowerCase());
                table.setRunout(Array.from(suitToLetter.entries()).reduce((prev, entry) => prev.replaceAll(...entry), runout));
            }
        }
    }
}

export async function postProcessLogsAfterHand(logs: Array<Array<string>>, game: Game) {
    const table = game.getTable();
    // 0 means they didn't put in money, 1 means they put in money but didn't raise (CALL)
    // 2 means they put in money through a raise. 1 -> vpip, 2 -> vpip & pfr
    // higher numbers override lower numbers
    let action_count = 0;
    for (const log of logs) {
        if (log.length > 3) {
            const player_id = log[0];
            const action = log[2];
            let action_num = 0;
            if (action === Action.CALL) {
                action_num = 1;
                action_count += 1;
            } else if (action === Action.BET || action === Action.RAISE) {
                action_num = 2;
                action_count += 1;
            }
            if (!table.existsInIdToActionNum(player_id) || table.getActionNumFromId(player_id)! < action_num) {
                table.updateIdToActionNum(player_id, action_num);
            }
        }
    }
    if (action_count == 0) {
        const player_ids_arr = Array.from(table.getIdToActionNum().keys());
        player_ids_arr.forEach(player_id => {
            const player_stats = table.getPlayerStatsFromName(table.getNameFromId(player_id));
            player_stats.incrementWalks();
        })
    }
}