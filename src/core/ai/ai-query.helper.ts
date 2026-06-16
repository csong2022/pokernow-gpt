import { BotAction } from "./ai-client.interface.ts";

export const playstyleToPrompt: Map<string, string> = new Map<string, string>([
    ["pro", "You are a pro poker player who plays strong ranges preflop and plays aggressively postflop."],
    ["aggressive", "You are an experienced poker player who plays aggressively like a maniac."],
    ["passive", "You are an experienced poker player who plays passively like a nit."],
    ["neutral", "You are an experienced poker player who plays strong ranges preflop, has a balanced playstyle, and calls all-ins when you have a strong hand"]
]);

export function getPromptFromPlaystyle(playstyle: string): string {
    const prompt = playstyleToPrompt.get(playstyle);
    if (prompt !== undefined) {
        return prompt;
    }
    throw new Error("Invalid playstyle, could not get playstyle prompt.");
}

const EMPTY_ACTION: BotAction = { action_str: "", bet_size_in_BBs: 0 };

// Parse the model's reply by anchoring on the LAST "Final Answer:" line, ignoring
// all preceding reasoning text (so "I considered folding but will raise" -> raise,
// not fold). Tolerant of case, "Final Answer:" / "final answer -", and trailing
// punctuation. Returns an empty action (action_str === "") when no final-answer
// line is found, which the decision engine treats as a parse failure (-> rethink).
export function parseResponse(msg: string): BotAction {
    const tail = extractFinalAnswer(msg);
    if (tail == null) return EMPTY_ACTION;

    const action_matches = tail.match(/all[\s-]?in|fold|check|call|bet|raise/i);
    if (!action_matches) return EMPTY_ACTION;
    let action_str = action_matches[0].toLowerCase();
    if (action_str.replace(/[\s-]/g, "") === "allin") action_str = "all-in";

    const bet_size_matches = tail.match(/[+]?([0-9]+(?:\.[0-9]*)?|\.[0-9]+)/);
    const bet_size_in_BBs = bet_size_matches ? parseFloat(bet_size_matches[0]) : 0;

    return { action_str, bet_size_in_BBs };
}

// The text after the final "final answer" marker on its line, or null if absent.
function extractFinalAnswer(msg: string): string | null {
    if (!msg) return null;
    const re = /final\s*answer\s*[:\-]?\s*(.+)/gi;
    let last: string | null = null;
    for (const m of msg.matchAll(re)) last = m[1].trim();
    return last;
}