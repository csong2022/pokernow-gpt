import express from 'express';
import player_router from './app/routes/player-routes.ts';
import prompt from 'prompt-sync';
import * as puppeteer_service from './app/webdriver/puppeteer-service.ts';
import { SUCCESS_RESPONSE, log_response } from './app/utils/error-handling-utils.ts';
import { Table } from './app/models/table.ts';
import { fetchData, getFirst, getCreatedAt, getData, getMsg } from './app/services/log-service.ts';
import { validateAllMsg } from './app/services/message-service.ts';

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
const t = new Table(1, "NLH", 1)
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


await puppeteer_service.waitForPlayerAction();

t.nextRound()
var lastCreated;
const log = await fetchData("GET", game_id, "", "")

if (log.code === SUCCESS_RESPONSE) {
    let res = getData(log)
    lastCreated = getFirst(getCreatedAt(res))
}

for (let i = 0; i < 3; i++) {
    console.log("Waiting for player turn to start.")
    //await puppeteer_service.waitForPlayerTurn();
    var res;
    const log = await fetchData("GET", game_id, "", lastCreated)
    if (log.code === SUCCESS_RESPONSE) {
        let res = getData(log)
        //console.log("res", res)
        let onlyValid = validateAllMsg(getMsg(res))

        t.processLogs(onlyValid)
        console.log("onlyValid", onlyValid)
        console.log(t.getQueue())
        t.convertDict()
        console.log("updated player positions")
        
        console.log(lastCreated)
        console.log(t.getDict())
        console.log(t.getQueue())

        lastCreated = getFirst(getCreatedAt(res))
        console.log("updated lastCreated")
        console.log(lastCreated)
    }

    res = await puppeteer_service.waitForPlayerTurn();
    if (res.code === "success") {}

    console.log("Waiting for next player action to start.")
    log_response(await puppeteer_service.waitForNextPlayerAction(30));

    res = await puppeteer_service.waitForWinner();
    if (res.code === "success") {
        break;
    }
}
console.log("YAY WE HAVE COMPLETED ONE HAND.")