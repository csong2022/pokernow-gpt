"""
PokerKit state-transition oracle.

A long-lived process speaking line-delimited JSON-RPC over stdin/stdout. It owns
PokerKit `State` objects (the source of truth for all poker rules) keyed by
game_id; TS never reimplements poker logic. stdout carries ONLY protocol JSON
(one object per line, flushed); all diagnostics go to stderr.

Protocol:
  request  : {"id": <n>, "method": <str>, "params": {...}}
  response : {"id": <n>, "result": {...}} | {"id": <n>, "error": "<Type>: <msg>"}

Cards are emitted in PokerKit's native short form ("Th", "Ah"); the TS mapper
owns any core-format conversion. Chip amounts are raw (engine truth); the TS
mapper normalizes to big blinds for the core model.
"""
import sys
import json
import traceback

from pokerkit import NoLimitTexasHoldem, Automation, Mode, Card

# Automate every mechanical step EXCEPT hole/board dealing, which we keep manual
# so an explicit deck can be injected (deal control for the future duplication
# harness). Betting decisions are always manual.
AUTOMATIONS = tuple(
    a for a in Automation if a.name not in ("HOLE_DEALING", "BOARD_DEALING")
)

MODES = {"cash": Mode.CASH_GAME, "tournament": Mode.TOURNAMENT}

# game_id -> game record
games: dict = {}


def log(*args):
    print(*args, file=sys.stderr, flush=True)


def card_str(card) -> str:
    return f"{card.rank}{card.suit}"


def normalize_stacks(starting_stacks, player_count):
    if isinstance(starting_stacks, (list, tuple)):
        return list(starting_stacks)
    return [starting_stacks] * player_count


def deal_pending(state, deck=None):
    """Drive the non-decision dealing steps. With a deck, deal specific cards;
    otherwise deal randomly. deck is a mutable list of card-strings consumed FIFO."""
    def take(n):
        cards = "".join(deck[:n]) if deck else None
        if deck:
            del deck[:n]
        return cards

    while True:
        if state.can_deal_hole():
            # one card per hole-dealing step
            state.deal_hole(take(1))
        elif state.can_deal_board():
            state.deal_board(take(1))
        else:
            break


def blind_indices(state, small_blind, big_blind):
    """Derive (sb_index, bb_index) from the post-blind bets at hand start. Blind
    posting is automated, so by the time we inspect the state the poster-index
    list is already drained; the bets still equal the blinds before any action."""
    bets = list(state.bets)
    sb = bets.index(small_blind) if small_blind in bets else None
    bb = bets.index(big_blind) if big_blind in bets else None
    return sb, bb


def button_index(rec):
    """Dealer button seat. Heads-up: the SB is on the button. Otherwise the seat
    immediately before the SB."""
    n = rec["player_count"]
    sb = rec["sb_index"]
    if sb is None:
        return None
    if n == 2:
        return sb
    return (sb - 1) % n


def legal_actions(state):
    if not state.status or state.actor_index is None:
        return None
    can_raise = False
    mn = mx = None
    try:
        mn = state.min_completion_betting_or_raising_to_amount
        mx = state.max_completion_betting_or_raising_to_amount
        can_raise = mn is not None and state.can_complete_bet_or_raise_to(mn)
    except Exception:
        can_raise = False
    return {
        "fold": state.can_fold(),
        "check_call": state.can_check_or_call(),
        "check_call_amount": state.checking_or_calling_amount,
        "raise": can_raise,
        "min": mn,
        "max": mx,
    }


def state_view(game_id):
    rec = games[game_id]
    state = rec["state"]
    board = [card_str(c) for row in state.board_cards for c in row]
    pots = [
        {"amount": p.unraked_amount, "seats": list(p.player_indices)}
        for p in state.pots
    ]
    return {
        "game_id": game_id,
        "status": state.status,
        "hand_over": not state.status,
        "street_index": state.street_index,
        "actor_index": state.actor_index,
        "player_count": rec["player_count"],
        "button": rec["button"],
        "sb_index": rec["sb_index"],
        "bb_index": rec["bb_index"],
        "small_blind": rec["small_blind"],
        "big_blind": rec["big_blind"],
        "stacks": list(state.stacks),
        "bets": list(state.bets),
        "board": board,
        "hole_cards": rec["holes"],
        "starting_stacks": rec["starting_stacks"],
        "pots": pots,
        "total_pot": state.total_pot_amount,
        "legal_actions": legal_actions(state),
        "actions": rec["actions"],
    }


def classify_and_record(rec, state, action, amount):
    """Classify an action into a core-friendly type before it is applied."""
    if action == "fold":
        entry = {"type": "folds", "amount": 0}
    elif action == "check_call":
        cc = state.checking_or_calling_amount
        entry = {"type": "checks" if cc == 0 else "calls", "amount": cc}
    elif action == "raise":
        is_raise = max(state.bets) > 0
        entry = {"type": "raises" if is_raise else "bets", "amount": amount}
    else:
        raise ValueError(f"unknown action {action!r}")
    entry["seat"] = state.actor_index
    entry["street_index"] = state.street_index
    rec["actions"].append(entry)


def create_game(params):
    gid = params["game_id"]
    pc = params["player_count"]
    sb, bb = params["blinds"]
    games[gid] = {
        "player_count": pc,
        "blinds": [sb, bb],
        "small_blind": sb,
        "big_blind": bb,
        "min_bet": params.get("min_bet", bb),
        "antes": params.get("antes", 0),
        "starting_stacks": normalize_stacks(params["starting_stacks"], pc),
        "mode": MODES[params.get("mode", "cash")],
        "state": None,
        "holes": [],
        "actions": [],
        "sb_index": None,
        "bb_index": None,
        "button": None,
    }
    return {"game_id": gid}


def start_hand(params):
    gid = params["game_id"]
    rec = games[gid]
    deck = list(Card.parse(params["deck"])) if params.get("deck") else None
    deck = [card_str(c) for c in deck] if deck else None  # FIFO string list

    state = NoLimitTexasHoldem.create_state(
        AUTOMATIONS,
        True,                       # ante_trimming_status
        rec["antes"],
        tuple(rec["blinds"]),
        rec["min_bet"],
        rec["starting_stacks"],     # reset to configured stacks each hand (M1)
        rec["player_count"],
        mode=rec["mode"],
    )
    rec["state"] = state
    rec["actions"] = []
    sb, bb = blind_indices(state, rec["small_blind"], rec["big_blind"])
    rec["sb_index"], rec["bb_index"] = sb, bb
    rec["button"] = button_index(rec)
    deal_pending(state, deck)
    rec["holes"] = [[card_str(c) for c in h] for h in state.hole_cards]
    return state_view(gid)


def apply_action(params):
    gid = params["game_id"]
    rec = games[gid]
    state = rec["state"]
    action = params["action"]
    amount = params.get("amount")
    classify_and_record(rec, state, action, amount)
    if action == "fold":
        state.fold()
    elif action == "check_call":
        state.check_or_call()
    elif action == "raise":
        state.complete_bet_or_raise_to(amount)
    else:
        raise ValueError(f"unknown action {action!r}")
    deal_pending(state)
    return state_view(gid)


def showdown(params):
    gid = params["game_id"]
    rec = games[gid]
    state = rec["state"]
    final = list(state.stacks)
    start = rec["starting_stacks"]
    deltas = [final[i] - start[i] for i in range(len(final))]
    winners = [i for i, d in enumerate(deltas) if d > 0]
    payouts = {str(i): deltas[i] for i in range(len(deltas))}
    return {
        "winners": winners,
        "payouts": payouts,
        "final_stacks": final,
        "hand_record": {
            "hole_cards": rec["holes"],
            "board": [card_str(c) for row in state.board_cards for c in row],
            "actions": rec["actions"],
            "starting_stacks": start,
            "final_stacks": final,
            "deltas": deltas,
            "button": rec["button"],
            "sb_index": rec["sb_index"],
            "bb_index": rec["bb_index"],
            "small_blind": rec["small_blind"],
            "big_blind": rec["big_blind"],
        },
    }


def end_game(params):
    games.pop(params["game_id"], None)
    return {"ok": True}


HANDLERS = {
    "create_game": create_game,
    "start_hand": start_hand,
    "get_state": lambda p: state_view(p["game_id"]),
    "apply_action": apply_action,
    "showdown": showdown,
    "end_game": end_game,
}


def main():
    log("[engine] pokerkit oracle ready")
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except Exception as e:
            log(f"[engine] bad JSON: {e}")
            continue
        rid = req.get("id")
        try:
            handler = HANDLERS.get(req["method"])
            if handler is None:
                raise ValueError(f"unknown method {req['method']!r}")
            out = {"id": rid, "result": handler(req.get("params", {}))}
        except Exception as e:
            log("[engine] " + traceback.format_exc())
            out = {"id": rid, "error": f"{type(e).__name__}: {e}"}
        sys.stdout.write(json.dumps(out) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
