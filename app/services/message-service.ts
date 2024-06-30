import { Action, Data, Log, Street } from "../utils/log-processing-utils.ts";
import { convertToBBs } from "../utils/log-processing-utils.ts";

export function getPlayer(msg: string): Array<string> {
    const res = new Array<string>;
    const split = msg.split(" @ ");
    if (split.length > 1) {
        const name = split[0].split("\"")[1];
        const tag = split[1].split("\"")[0];
        res.push(tag, name);
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
    for (let i = 0; i < msgs.length; i++) {
        if (msgs[i].includes("Player stacks: ")) {
            return msgs[i]
            }
        }
    return ""
}

export function getPlayerStacksFromMsg(msg: string, stakes: number): Map<string, number>{
    //starts from the bottom of logs
    const re = RegExp('\\@\\s([^"]*)\\"\\s\\((\\d+)\\)', 'g');
    let res = new Map<string, number>;
    let regExps = [...msg.matchAll(re)];
    regExps.forEach((element) => {
        res.set(element[1], convertToBBs(Number(element[2]), stakes));
        })
    return res;
    }

export function getTableSeatFromMsg(msg: string): Map<number, string>{
    //starts from the bottom of logs
    const re = RegExp('\\#(\\d+)\\s\\"[^@]+\\@\\s([^"]*)', 'g');
    let res = new Map<number, string>;
    let regExps = [...msg.matchAll(re)];
    regExps.forEach((element) => {
        res.set(parseInt(element[1]), element[2]);
        })
    return res;
    }

export function getNameToIdFromMsg(msg: string): Map<string, string>{
    //starts from the bottom of logs
    const re = RegExp('\\#\\d+\\s\\"([^@]+)\\s\\@\\s([^"]*)', 'g');
    let res = new Map<string, string>;
    let regExps = [...msg.matchAll(re)];
    regExps.forEach((element) => {
        res.set(element[1], element[2]);
        })
    return res;
    }

export function pruneLogsBeforeCurrentHand(data: Data): Data {
    //starts from the top of logs
    const log_arr = new Array<Log>;
    let i = 0;
    while ((i < data.logs.length) && !(data.logs[i].msg.includes("starting hand #"))) {
        log_arr.push(data.logs[i]);
        i += 1;
    }
    log_arr.push(data.logs[i]);
    return {
        logs: log_arr
    }
}

// currently not used anywhere, maybe can be removed
export function pruneFlop(msgs: Array<string>): Array<string> {
    //starts from the bottom of logs
    const res = new Array<string>;
    let i = msgs.length - 1;
    while ((i > 0) && !(msgs[i].includes("Flop: "))) {
        res.push(msgs[i]);
        i -= 1;
    }
    res.push(msgs[i]);
    return res;
}

export function validateMsg(msg: string): Array<string> {
    let w = getFirstWord(msg);
    let temp = msg.split(": ")[0];
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

export function validateAllMsg(msgs: Array<string>): Array<Array<string>> {
    const res = new Array<Array<string>>
    msgs.forEach((element) => {
        const first = getFirstWord(element);
        const player = getPlayer(element);
        let temp = element.split(": ")[0];
        if (Object.values<string>(Street).includes(temp)) {
            res.push(validateMsg(element));
        }
        if (player.length > 1) {
            const player_action  = getPlayerAction(element, player[0]);
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