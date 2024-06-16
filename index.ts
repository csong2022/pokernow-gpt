import express from 'express';
import bot_factory from './bot-factory.ts'
import player_router from './app/routes/player-routes.ts';


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

await bot_factory();