import express from 'express';
import player_router from './app/routes/player-routes.ts';
import prompt from 'prompt-sync';
import * as puppeteer_service from './app/webdriver/puppeteer-service.ts';

const app = express();
const port = 8080;

app.use(express.json());

app.get('/', (req: any, res:any) => {
    res.json({'message': 'ok'});
})

app.use('/player', player_router);

app.listen(
    port,
    () => console.log('App listening on http://localhost:${PORT}')
)

const io = prompt();
const game_id = io("Enter the PokerNow game id (ex. https://www.pokernow.club/games/{game_id}): ")
console.log(`The PokerNow game with id: ${game_id} will now open.`);

await puppeteer_service.init(game_id);

const name = io("What is your desired player name? ");
console.log(`Your player name will be ${name}.` )

const stack_size = io("What is your desired stack size? ");
console.log(`Your initial stack size will be ${stack_size}.`)

console.log(`Attempting to enter table with name: ${name} and stack size: ${stack_size}.`);
await puppeteer_service.enterTable(name, Number(stack_size));

