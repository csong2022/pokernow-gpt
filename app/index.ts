import express from 'express';
import bot_router from './routes/bot-routes.ts';
import playerstats_router from './routes/playerstats-routes.ts';
import db_service from './services/db-service.ts';

const app = express();
const port = 8080;

app.use(express.json());

app.get('/', (req: any, res: any) => {
    res.json({'message': 'ok'});
})

app.use('/playerstats', playerstats_router);

app.use('/bot', bot_router);

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