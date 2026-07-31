import { Game } from '../core/game/game.model.ts';
import { AIConfig } from '../core/ai/ai-config.interface.ts';
import { AIService, BotAction } from '../core/ai/ai-client.interface.ts';
import { AIServiceFactory } from '../core/ai/ai-service-factory.helper.ts';
import { ActionAvailability } from '../core/poker/action-availability.interface.ts';
import { DecisionEngine, DecisionEvent, DecisionTrace } from '../core/poker/decision-engine.ts';
import { NoOpponentContext } from './no-opponent-context.ts';
import { HandState } from '../core/game/hand-state.ts';
import { Logger } from '../utils/logger.util.ts';

import { LegalActions, StateView } from './engine/protocol.ts';
import { DesiredAction } from './action-policy.ts';

export interface Agent {
    readonly name: string;
    startHand(): void;
    decide(game: Game, view: StateView, heroSeat: number): Promise<DesiredAction>;
    // Decision-engine events (rethink/fallback) since the last call; runner logs them.
    drainEvents?(): DecisionEvent[];
    // Full per-decision traces (prompt + raw response + parsed action + events) since
    // the last call; runner writes them into the replayable hand log.
    drainDecisions?(): DecisionTrace[];
}

// ---- Stub agent: deterministic-ish legal play, zero API cost. ----------------
// Mostly checks/calls (so hands reach showdown for side-pot/payout checks), with
// occasional min-raises and rare folds. Always returns a legal-ish desired
// action; resolveAction is the final safety net.
export class StubAgent implements Agent {
    constructor(public readonly name = 'stub', private readonly rng: () => number = Math.random) {}

    startHand(): void {}

    async decide(_game: Game, view: StateView): Promise<DesiredAction> {
        const la = view.legal_actions!;
        const r = this.rng();
        if (la.raise && la.min != null && r < 0.15) {
            return { kind: 'raise', amountBB: la.min / view.big_blind };
        }
        if (la.check_call) {
            if (la.check_call_amount > 0 && la.fold && r > 0.92) return { kind: 'fold' };
            return la.check_call_amount === 0 ? { kind: 'check' } : { kind: 'call' };
        }
        return la.fold ? { kind: 'fold' } : { kind: 'check' };
    }
}

// ---- LLM agent: reuses the core decision-engine VERBATIM. --------------------
// The only arena-specific wiring is an ActionAvailability backed by the engine's
// legal_actions and a HandState whose game is swapped in each decision point.
class LegalActionsAvailability implements ActionAvailability {
    private legal: LegalActions = { fold: false, check_call: false, check_call_amount: 0, raise: false, min: null, max: null };
    set(legal: LegalActions): void {
        this.legal = legal;
    }
    async canBet(): Promise<boolean> {
        return this.legal.raise;
    }
    async canCall(): Promise<boolean> {
        return this.legal.check_call && this.legal.check_call_amount > 0;
    }
    async canCheck(): Promise<boolean> {
        return this.legal.check_call && this.legal.check_call_amount === 0;
    }
    async canFold(): Promise<boolean> {
        return this.legal.fold;
    }
}

function botActionToDesired(ba: BotAction): DesiredAction {
    switch (ba.action_str) {
        case 'fold': return { kind: 'fold' };
        case 'check': return { kind: 'check' };
        case 'call': return { kind: 'call' };
        case 'bet': return { kind: 'bet', amountBB: ba.bet_size_in_BBs };
        case 'raise': return { kind: 'raise', amountBB: ba.bet_size_in_BBs };
        case 'all-in': return { kind: 'allin' };
        default: return { kind: 'fold' };
    }
}

export class LLMAgent implements Agent {
    readonly name: string;
    private readonly ai: AIService;
    private readonly availability = new LegalActionsAvailability();
    private readonly state: HandState;
    private readonly engine: DecisionEngine;
    private events: DecisionEvent[] = [];
    private traces: DecisionTrace[] = [];

    constructor(seat: number, aiConfig: AIConfig, gameId: string, queryRetries = 2, styleLabel?: string) {
        this.ai = new AIServiceFactory().createAIService(aiConfig.provider, aiConfig.model_name, aiConfig.playstyle, aiConfig.reasoning ?? 'none', aiConfig.systemPrompt ?? '');
        this.ai.init();
        this.ai.setBotName(`Seat${seat}`);
        const logger = new Logger(`arena-${seat}`, aiConfig.model_name);
        this.state = new HandState(`arena-${seat}`, aiConfig.provider, aiConfig.model_name, gameId);
        this.engine = new DecisionEngine(
            this.ai, this.availability, new NoOpponentContext(), this.state, logger, queryRetries, 0,
            (e) => this.events.push(e),
            (t) => this.traces.push(t),
        );
        // Encode a non-neutral style in the identity so the analysis (which keys by
        // modelIdOf = name minus #seat) can distinguish same-model seats running
        // different styles. The label is the explicit style token (playstyle or probe
        // key) from the composition root; fall back to a non-neutral playstyle. Neutral
        // omits the suffix, so normal runs are unchanged.
        const tag = styleLabel ?? (aiConfig.playstyle && aiConfig.playstyle !== 'neutral' ? aiConfig.playstyle : '');
        const styleSuffix = tag ? `@${tag}` : '';
        this.name = `${aiConfig.provider}:${aiConfig.model_name}${styleSuffix}#${seat}`;
    }

    startHand(): void {
        this.state.is_first_turn_of_hand = true;
        this.ai.resetHand();
    }

    drainEvents(): DecisionEvent[] {
        const drained = this.events;
        this.events = [];
        return drained;
    }

    drainDecisions(): DecisionTrace[] {
        const drained = this.traces;
        this.traces = [];
        return drained;
    }

    async decide(game: Game, view: StateView): Promise<DesiredAction> {
        this.availability.set(view.legal_actions!);
        this.state.game = game; // decision-engine reads this.state.game.getHero()
        const botAction = await this.engine.decide(game);
        return botActionToDesired(botAction);
    }
}
