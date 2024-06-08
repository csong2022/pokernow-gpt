
export function getPlayer(msg: string): Array<string> {
    let res = new Array<string>
    let split = msg.split(" @ ")
    if (split.length > 1) {
        let name = split[0].split("\"")[1]
        let tag = split[1].split("\"")[0]
        res.push(tag, name)
    }
    return res
}

export function getPlayerAction(msg: string, player: string): string {
    let split = msg.split(player)
    if (split.length > 1) {
        return split[1].substring(2)
    }
    return ""
}

export function getFirstWord(msg: string): string {
    let split = msg.split(" ")
    let res = split[0]
    return res
}

interface Action {
    playerName: string,
    playerID: string,
    playerAction: string,
    actionMsg: string
    actionNum: number,
}

interface Runout {
    street: string,
    cards: string
}

const streets = ["Flop:", "Turn:", "River:"]
const actions = ["calls", "folds", "checks", "bets", "raises", "posts"]

export function validateMsg(msg: string): Array<string> {
    let w = getFirstWord(msg)
    if (streets.includes(w)) {
        w = w.substring(0, w.length - 1)
        let temp = msg.split(": ")
        msg = temp[1]
        return [w, msg]
    } else if (actions.includes(w)) {
        return [w, msg]
    }
    return []
}

export function validateAllMsg(msgs: Array<string>): Array<Array<string>> {
    let res = new Array<Array<string>>
    msgs.forEach((element) => {
        let first = getFirstWord(element)
        let player = getPlayer(element)
        if (streets.includes(first)) {
            res.push(validateMsg(element))
        }
        if (player.length > 1) {
            let playerAction  = getPlayerAction(element, player[0])
            let validate = validateMsg(playerAction)
            if (!(validate === undefined || validate.length == 0)) {
                let value = validate[1].replace(/\D/g, "");
                let curr = player.concat(validate).concat(value)
                res.push(curr)
            }
        }
    })
    return res
}