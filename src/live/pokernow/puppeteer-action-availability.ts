import { ActionAvailability } from '../../core/poker/action-availability.interface.ts';
import { PuppeteerService } from './puppeteer.service.ts';

// Live adapter: answers the core ActionAvailability port by probing the
// PokerNow table UI via PuppeteerService. Each waitFor*Option resolves with a
// Response whose code is "success" when the option is present.
export class PuppeteerActionAvailability implements ActionAvailability {
    constructor(private puppeteer: PuppeteerService) {}

    async canBet(): Promise<boolean> {
        return (await this.puppeteer.waitForBetOption()).code === "success";
    }
    async canCall(): Promise<boolean> {
        return (await this.puppeteer.waitForCallOption()).code === "success";
    }
    async canCheck(): Promise<boolean> {
        return (await this.puppeteer.waitForCheckOption()).code === "success";
    }
    async canFold(): Promise<boolean> {
        return (await this.puppeteer.waitForFoldOption()).code === "success";
    }
}
