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

async function findSeat() {
    await page.$eval(".options", (el: any) => el.click());
}

await init('pgltNd4w17e6J4JXouHm6dw5l');
await findSeat();