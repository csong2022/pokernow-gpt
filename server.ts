import express from 'express';
import player_router from './app/routes/player-routes.ts';
import prompt from 'prompt-sync';
import * as puppeteer_service from './app/webdriver/puppeteer-service.ts';
import { log_response } from './app/utils/error-handling-utils.ts';

const app = express();
const port = 8080;

app.use(express.json());

app.get('/', (req: any, res:any) => {
    res.json({'message': 'ok'});
})

app.use('/player', player_router);

app.listen(
    port,
    () => console.log(`App listening on http://localhost:${port}`)
)

const io = prompt();
const game_id = io("Enter the PokerNow game id (ex. https://www.pokernow.club/games/{game_id}): ")
console.log(`The PokerNow game with id: ${game_id} will now open.`);

log_response(await puppeteer_service.init(game_id));

while (true) {
    const name = io("What is your desired player name? ");
    console.log(`Your player name will be ${name}.` )

    const stack_size = io("What is your desired stack size? ");
    console.log(`Your initial stack size will be ${stack_size}.`)

    console.log(`Attempting to enter table with name: ${name} and stack size: ${stack_size}.`);
    const code = log_response(await puppeteer_service.sendEnterTableRequest(name, Number(stack_size)));

    if (code === "success") {
        break;
    }
    console.log("Please try again.");
}

console.log("Waiting for table host to accept ingress request.");
log_response(await puppeteer_service.waitForTableEntry());

// TODO: update dummy parameters
console.log("Waiting for next hand to start.")
log_response(await puppeteer_service.waitForNextHand(10, 30));

console.log("Waiting for player turn to start.")
// TODO: update dummy parameters
log_response(await puppeteer_service.waitForPlayerTurn(10, 30));