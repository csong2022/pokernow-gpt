
export function getPlayer(msg: string): Array<String> {
    let res = new Array<string>
    let split = msg.split(" @ ")
    if (split.length > 1) {
        let name = split[0].split("\"")[1]
        let tag = split[1].split("\"")[0]
        res.push(name, tag)
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

export function validateMsg(msg: string): Array<string> {
    let w = getFirstWord(msg)
    const streets = ["Flop:", "Turn:", "River:"]
    const actions = ["calls", "folds", "checks", "bets", "raises", "posts"]
    if (streets.includes(w)) {
        return ["street", w, msg]
    } else if (actions.includes(w)) {
        return ["action", w, msg]
    }
    return ["not useful msg", w, msg]
}

export function validateAllMsg(msgs: Array<string>): Array<Array<string>> {
    let res = new Array<Array<string>>
    msgs.forEach((element) => {
        res.push(validateMsg(element))
    })
    return res
}