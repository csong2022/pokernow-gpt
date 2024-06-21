import { Queue } from "../utils/data-structures.ts";

export async function constructQuery() {

}

function postProcessLogs(logs_queue: Queue<Array<string>>) {
    while (logs_queue) {
        const log = logs_queue.dequeue();
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
        query.concat(cards[i]);
        if (i != cards.length - 1) {
            query.concat(", ");
        }
    }
    return query;
}

function defineActions() {
    let query = "Here are the past player actions:"
    
}