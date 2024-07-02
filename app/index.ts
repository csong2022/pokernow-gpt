import once from 'events';
import express from 'express';
import bot_manager from './bot-manager.ts'
import player_router from './routes/player-routes.ts';
import db_service from './services/db-service.ts';

const app = express();
/* const port = 8080;

app.use(express.json());

app.get('/', (req: any, res:any) => {
    res.json({'message': 'ok'});
})

app.use('/player', player_router); */

async function startServer() {
    await db_service.init();
    await db_service.createTables();
    /* return new Promise<void>((resolve) => {
        app.listen(port, ()  => {
            console.log(`App listening on http://localhost:${port}`);
            return resolve();
        });
    }); */
}

startServer().then(
    async() => await bot_manager()
)