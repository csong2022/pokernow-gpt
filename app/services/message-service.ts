import { Actions, Streets } from "../utils/log-processing-utils.ts";

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

export function pruneStarting(msgs: Array<string>): Array<string> {
    const res = new Array<string>;
    let i = 0;
    while ((i < msgs.length) && !(msgs[i].includes("starting hand #"))) {
        res.push(msgs[i]);
        i += 1;
    }
    res.push(msgs[i]);
    return res;
}
export function validateMsg(msg: string): Array<string> {
    let w = getFirstWord(msg);
    if (Object.values<string>(Streets).includes(w)) {
        w = w.substring(0, w.length - 1);
        const temp = msg.split(": ");
        msg = temp[1];
        return [w, msg];
    } else if (Object.values<string>(Actions).includes(w)) {
        return [w, msg];
    }
    return [];
}

export function validateAllMsg(msgs: Array<string>): Array<Array<string>> {
    const res = new Array<Array<string>>
    msgs.forEach((element) => {
        const first = getFirstWord(element);
        const player = getPlayer(element);
        if (Object.values<string>(Streets).includes(first)) {
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