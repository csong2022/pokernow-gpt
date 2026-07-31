import { Game } from "../../core/game/game.model.ts";
import { Table } from "../../core/game/table.model.ts";
import { PlayerAction } from "../../core/player/playeraction.model.ts";
import { Queue } from "../../utils/data-structures.util.ts";
import { convertToBBs } from "../../core/poker/value-conversion.util.ts";
import { Action } from "../../core/poker/action.enum.ts";

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

// Expects logs in chronological order (oldest first). Populates the table's
// logs queue in chronological order so postProcessLogs can consume them FIFO.
export function preProcessLogs(chronological_logs: Array<Array<string>>, game: Game) {
    const table = game.getTable();
    chronological_logs.forEach((element) => {
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
                table.incrementCallCount(player_id);
            } else if (action === Action.BET) {
                action_num = 2;
                action_count += 1;
                table.incrementBetCount(player_id);
            } else if (action === Action.RAISE) {
                action_num = 2;
                action_count += 1;
                table.incrementRaiseCount(player_id);
            } else if (action === Action.FOLD) {
                table.incrementFoldCount(player_id);
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

    detectPreflopAggression(logs, table);
}

// Tracks two preflop concepts in a single chronological pass:
//   1. 3-bet opportunity / 3-bet — the 2nd voluntary preflop raise (the open is 1st, blinds excluded).
//      A player has a 3-bet opportunity on their first voluntary action when exactly one prior
//      voluntary raise has occurred; they 3-bet if their action is bet/raise at that point.
//   2. Faced 3-bet / folded to 3-bet — applies to the opener (first voluntary raiser). When a
//      3-bet occurs after their open, the opener's next action determines whether they folded.
function detectPreflopAggression(logs: Array<Array<string>>, table: Table): void {
    // logs are already chronological at this point — preProcessLogs mutates the array
    // in place via .reverse() before postProcessLogsAfterHand runs.
    let current_street = Street.PREFLOP;
    let preflop_voluntary_raises = 0;
    let opener_id: string | null = null;
    let three_bet_made = false;
    let opener_responded_to_three_bet = false;
    const preflop_actors = new Set<string>();

    for (const log of logs) {
        if (log.length === 2 && Object.values<string>(Street).includes(log[0])) {
            current_street = log[0] as Street;
            if (current_street !== Street.PREFLOP) break;
            continue;
        }
        if (log.length <= 3) continue;
        if (current_street !== Street.PREFLOP) continue;

        const player_id = log[0];
        const action = log[2];

        if (action === Action.POST) continue;

        // 3-bet opportunity / 3-bet
        if (!preflop_actors.has(player_id) && preflop_voluntary_raises === 1) {
            table.addThreeBetOpportunity(player_id);
            if (action === Action.RAISE || action === Action.BET) {
                table.addThreeBet(player_id);
            }
        }

        // Identify the opener (first voluntary raise)
        if (preflop_voluntary_raises === 0 && (action === Action.RAISE || action === Action.BET)) {
            opener_id = player_id;
        }

        // Detect that a 3-bet just happened
        if (preflop_voluntary_raises === 1 && (action === Action.RAISE || action === Action.BET)) {
            three_bet_made = true;
        }

        // Opener's response to a 3-bet
        if (three_bet_made && opener_id !== null && player_id === opener_id && !opener_responded_to_three_bet) {
            opener_responded_to_three_bet = true;
            table.addFacedThreeBet(opener_id);
            if (action === Action.FOLD) {
                table.addFoldedToThreeBet(opener_id);
            }
        }

        preflop_actors.add(player_id);

        if (action === Action.RAISE || action === Action.BET) {
            preflop_voluntary_raises += 1;
        }
    }
}