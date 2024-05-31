import express from 'express';
import player_router from './app/routes/player-routes';

const app = express();
const port = 8080;

app.use(express.json());

app.get('/', (req, res) => {
    res.json({'message': 'ok'});
})

app.use('/player', player_router);

app.listen(
    port,
    () => console.log('App listening on http://localhost:${PORT}')
)