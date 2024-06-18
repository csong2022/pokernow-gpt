import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, path } from 'path';

const app = express();

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'))
});

app.listen(8080, () => {
    console.log('Server is listening on port 8080');
});

