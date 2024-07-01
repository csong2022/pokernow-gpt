import { BotAction } from "../interfaces/ai-query-interfaces.ts";

export const playstyleToPrompt: Map<string, string> = new Map<string, string>([
    ["aggressive", "You are an experienced poker player, skilled at exploiting your opponents by making aggressive plays."],
    ["passive", "You are an experienced poker player with a passive and tight playstyle."],
    ["balanced", "You are an experienced poker player, skilled at both being passive and aggressive with your actions."]
]);

export function parseResponse(msg: string): BotAction {
    msg = processOutput(msg);

    const action_matches = msg.match(/(bet|raise|call|check|fold)/);
    let action_str = "";
    if (action_matches) {
        action_str = action_matches[0];
    }

    const bet_size_matches = msg.match(/[+]?([0-9]+(?:[\.][0-9]*)?|\.[0-9]+)/);
    let bet_size_in_BBs = 0;
    if (bet_size_matches) {
        bet_size_in_BBs = parseFloat(bet_size_matches[0]);
        if (isNaN(bet_size_in_BBs)) {
            throw new Error("Parsed bet size is not a number!");
        }
    }
    return {
        action_str: action_str,
        bet_size_in_BBs: bet_size_in_BBs
    }
}

function processOutput(msg: string): string {
    msg = msg.toLowerCase();
    const start_index = msg.indexOf("{");
    const end_index = msg.indexOf("}");
    if (start_index != -1 && end_index != -1) {
        return msg.substring(start_index + 1, end_index);
    }
    return msg;
}