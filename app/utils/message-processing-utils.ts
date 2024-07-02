import { Action, Street } from "./log-processing-utils.ts";
import { convertToBBs } from "./value-conversion-utils.ts";

export function getPlayer(msg: string): Array<string> {
    const res = new Array<string>;
    const split = msg.split(" @ ");
    if (split.length > 1) {
        const name = split[0].split("\"")[1];
        const id = split[1].split("\"")[0];
        res.push(id, name);
    }
    return res
}

export function getPlayerAction(msg: string, player: string): string {
    const split = msg.split(player);
    if (split.length > 1) {
        return split[1].substring(2);
    }
    return "";
}

export function getFirstWord(msg: string): string {
    const split = msg.split(" ");
    const res = split[0];
    return res;
}

export function getPlayerStacksMsg(msgs: Array<string>): string {
    //starts from the bottom of logs
    for (let i = 0; i < msgs.length; i++) {
        if (msgs[i].includes("Player stacks: ")) {
            return msgs[i]
            }
        }
    return ""
}

export function getIdToInitialStackFromMsg(msg: string, stakes: number): Map<string, number>{
    const re = RegExp('\\@\\s([^"]*)\\"\\s\\((\\d+)\\)', 'g');
    const res = new Map<string, number>;
    const matches = [...msg.matchAll(re)];
    matches.forEach((element) => {
        res.set(element[1], convertToBBs(Number(element[2]), stakes));
    })
    return res;
}

export function getTableSeatToIdFromMsg(msg: string): Map<number, string>{
    const re = RegExp('\\#(\\d+)\\s\\"[^@]+\\@\\s([^"]*)', 'g');
    const res = new Map<number, string>;
    const matches = [...msg.matchAll(re)];
    matches.forEach((element) => {
        res.set(parseInt(element[1]), element[2]);
    })
    return res;
}

export function getIdToTableSeatFromMsg(msg: string): Map<string, number>{
    const re = RegExp('\\#(\\d+)\\s\\"[^@]+\\@\\s([^"]*)', 'g');
    const res = new Map<string, number>;
    const matches = [...msg.matchAll(re)];
    matches.forEach((element) => {
        res.set(element[2], parseInt(element[1]));
    })
    return res;
}

export function getNameToIdFromMsg(msg: string): Map<string, string>{
    const re = RegExp('\\#\\d+\\s\\"([^@]+)\\s\\@\\s([^"]*)', 'g');
    const res = new Map<string, string>;
    const regExps = [...msg.matchAll(re)];
    regExps.forEach((element) => {
        res.set(element[1], element[2]);
        })
    return res;
}

export function getIdToNameFromMsg(msg: string): Map<string, string>{
    const re = RegExp('\\#\\d+\\s\\"([^@]+)\\s\\@\\s([^"]*)', 'g');
    const res = new Map<string, string>;
    const regExps = [...msg.matchAll(re)];
    regExps.forEach((element) => {
        res.set(element[2], element[1]);
        })
    return res;
}

//takes an unformatted action string and turns it into [id, name, action, msg, bet amount] format
//messages that are streets are formatted into [street, runout] and if neither street nor action are ignored
export function validateMsg(msg: string): Array<string> {
    let w = getFirstWord(msg);
    const temp = msg.split(": ")[0];
    if (Object.values<string>(Street).includes(temp)) {
        w = w.substring(0, w.length - 1);
        const temp = msg.split(": ");
        msg = temp[1];
        return [w, msg];
    } else if (Object.values<string>(Action).includes(w)) {
        return [w, msg];
    }
    return [];
}

//calls validateMsg on all msgs, if the msg is a street msg, validate immediately
//otherwise could be an action or invalid message, needs extra processing
//only valid messages are pushed and returned
export function validateAllMsg(msgs: Array<string>): Array<Array<string>> {
    const res = new Array<Array<string>>
    msgs.forEach((message) => {
        const player = getPlayer(message);
        let first_word = message.split(": ")[0];
        if (Object.values<string>(Street).includes(first_word)) {
            res.push(validateMsg(message));
        }
        if (player.length > 1) {
            const player_action  = getPlayerAction(message, player[0]);
            const validate = validateMsg(player_action);
            if (!(validate === undefined || validate.length == 0)) {
                let value = validate[1].replace(/\D/g, "");
                let curr = player.concat(validate).concat(value);
                res.push(curr);
            }
        }
    })
    return res;
}