import { PokerKitClient } from './engine/pokerkit-client.ts';
import { EngineAction, ShowdownResult, StateView } from './engine/protocol.ts';

/**
 * The arena Environment adapter — the same seam the live PokerNow adapter
 * implements: state goes IN (getState/startHand), actions come OUT (applyAction).
 * It is a thin per-game handle over the PokerKit oracle; the state-mapper turns
 * its state_view into the core Game model. Core/agents never see this.
 */
export class ArenaEnvironment {
    constructor(
        private readonly client: PokerKitClient,
        public readonly gameId: string,
    ) {}

    startHand(opts: { button?: number; deck?: string } = {}): Promise<StateView> {
        return this.client.startHand(this.gameId, opts);
    }

    getState(): Promise<StateView> {
        return this.client.getState(this.gameId);
    }

    applyAction(action: EngineAction): Promise<StateView> {
        return this.client.applyAction(this.gameId, action);
    }

    showdown(): Promise<ShowdownResult> {
        return this.client.showdown(this.gameId);
    }

    end(): Promise<{ ok: boolean }> {
        return this.client.endGame(this.gameId);
    }
}
