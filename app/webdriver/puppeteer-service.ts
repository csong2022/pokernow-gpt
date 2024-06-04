import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({
    defaultViewport: null,
    headless: false
});
const page = await browser.newPage();

async function init(game_id: string) {
    await page.goto(`https://www.pokernow.club/games/${game_id}`);
    await page.setViewport({width: 1920, height: 1080});
}

async function enterTable(name: string, stack_size: number): Promise<string>{
    try {
        await page.$eval(".table-player-seat-button", (button: any) => button.click());
    } catch (err) {
        console.log("Could not find open seat", err.message);
    }
    await page.focus(".selected > div > form > div:nth-child(1) > input");
    await page.keyboard.type(name);
    await page.focus(".selected > div > form > div:nth-child(2) > input");
    await page.keyboard.type(stack_size.toString())
    await page.$eval(".selected > div > form > button", (button: any) => button.click());
    try {
        await page.waitForSelector(".alert-1-buttons > button", {timeout: 2000});
        await page.$eval(".alert-1-buttons > button", (button: any) => button.click());
    } catch (err) {
        if (await page.$(".selected > div > form > div:nth-child(1) > .error-message")) {
            console.log("Player name must be unique to game");
        }
        return "ingress unsucessful";
    }
    return "ingress successful";
}