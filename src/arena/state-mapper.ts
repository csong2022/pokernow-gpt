import { Game } from '../core/game/game.model.ts';
import { Table } from '../core/game/table.model.ts';
import { PlayerAction } from '../core/player/playeraction.model.ts';
import { PlayerStatsRepository } from '../core/player/playerstats-repository.interface.ts';

import { StateView } from './engine/protocol.ts';

// PokerKit emits ten as "T"; the core prompt builder's regex expects "10".
function toCoreCard(card: string): string {
    return card[0] === 'T' ? '10' + card.slice(1) : card;
}

// PokerKit street_index -> core street label. Preflop is "" so the prompt prints
// "preflop" and shows no community cards (matching the live convention).
const STREET_LABELS = ['', 'flop', 'turn', 'river'];

function seatId(seat: number): string {
    return String(seat);
}

function seatName(seat: number): string {
    return `Seat${seat}`;
}

/**
 * Arena analog of live's state-builder: maps a PokerKit state_view into the core
 * Game model from the perspective of `heroSeat`, so query-construction (and thus
 * the whole core decision-engine) is reused verbatim. Chip amounts are
 * normalized to big blinds here — the one place the engine's raw-chip truth
 * meets core's BB-denominated model.
 */
export async function mapStateView(
    view: StateView,
    heroSeat: number,
    repo: PlayerStatsRepository,
): Promise<Game> {
    const bb = view.big_blind;
    const toBB = (chips: number): number => chips / bb;

    const table = new Table(repo);
    table.setNumPlayers(view.player_count);

    const idToName = new Map<string, string>();
    const nameToId = new Map<string, string>();
    const idToSeat = new Map<string, number>();
    const seatToId = new Map<number, string>();
    const idToStack = new Map<string, number>();

    for (let seat = 0; seat < view.player_count; seat++) {
        const id = seatId(seat);
        const name = seatName(seat);
        idToName.set(id, name);
        nameToId.set(name, id);
        // 1-indexed table seats so setIdToPosition can walk them like live does.
        idToSeat.set(id, seat + 1);
        seatToId.set(seat + 1, id);
        idToStack.set(id, toBB(view.starting_stacks[seat]));
    }

    table.setIdToName(idToName);
    table.setNameToId(nameToId);
    table.setIdToTableSeat(idToSeat);
    table.setTableSeatToId(seatToId);
    table.setIdToStack(idToStack);
    await table.updateCache(); // build name_to_player (fresh stats via the port)

    // Positions: walk seats from the small blind, then label by order (1=SB, …).
    const firstSeat = (view.sb_index ?? 0) + 1;
    table.setIdToPosition(firstSeat);
    table.convertAllOrdersToPosition();

    table.setStreet(STREET_LABELS[view.street_index ?? 0] ?? '');
    table.setRunout(view.board.map(toCoreCard).join(' '));
    table.setPot(toBB(view.total_pot));

    const currentStreet = view.street_index ?? 0;
    for (const entry of view.actions) {
        if (entry.street_index !== currentStreet) continue;
        table.updatePlayerActions(
            new PlayerAction(seatId(entry.seat), entry.type, toBB(entry.amount)),
        );
    }

    // Core blinds are unused by query-construction (amounts are pre-normalized to
    // BB), so express them in BB units for consistency.
    const game = new Game(view.game_id, table, 1, view.small_blind / bb, "No Limit Hold'em", 0);
    const heroHand = view.hole_cards[heroSeat].map(toCoreCard);
    game.createAndSetHero(seatId(heroSeat), heroHand, toBB(view.stacks[heroSeat]));
    return game;
}
