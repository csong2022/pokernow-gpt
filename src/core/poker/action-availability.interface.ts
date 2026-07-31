// Port (core-owned): can the table currently accept each action? The decision
// engine validates the AI's chosen action against what the table actually
// offers. Core only needs a yes/no; the live adapter answers by inspecting the
// table UI. A `bet` answer covers bet / raise / all-in (one shared option).

export interface ActionAvailability {
    canBet(): Promise<boolean>;
    canCall(): Promise<boolean>;
    canCheck(): Promise<boolean>;
    canFold(): Promise<boolean>;
}
