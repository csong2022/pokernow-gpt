import EventEmitter from 'events';
import express from 'express';
import bot_router from './routes/bot-routes.ts';
import playerstats_router from './routes/playerstats-routes.ts';
import db_service from './services/db-service.ts';
import bot_manager from './botmanager.ts';

const app = express();
const port = 8080;

const eventEmitter = new EventEmitter();

app.use(express.json());

app.get('/', (req: any, res: any) => {
    res.json({'message': 'ok'});
})

app.use('/playerstats', playerstats_router);

app.use('/bot', bot_router);

app.post('/game_id', (req: any, res: any) => {
    const data = req.body;
    eventEmitter.emit('botmanager_init', data.game_id);
    res.status(200).send("OK");
})

async function startServer(port: number) {
    await db_service.init();
    await db_service.createTables();
    return new Promise<void>((resolve) => {
        app.listen(port, () => {
            console.log(`App listening on http://localhost:${port}`);
            resolve();
        });
    });
}

await startServer(port);

eventEmitter.once('botmanager_init', async(game_id) => {
    console.log("Initializing with game_id: ", game_id);
    await bot_manager(game_id);
})