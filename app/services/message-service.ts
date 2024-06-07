
export function filter(msg: string): string {
    let split = msg.split(" @ ")
    let name = split[0].split("\"")[1]
    let tag = split[1].split("\"")[0]
    return msg
}

export function getPlayer(msg: string): Array<String> {
    let split = msg.split(" @ ")
    let name = split[0].split("\"")[1]
    let tag = split[1].split("\"")[0]
    let res = new Array<string>
    res.push(name, tag)
    return res
}