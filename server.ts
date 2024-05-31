const express = require('express');
const app = express();
const port = 8080;

app.use(express.json());

app.get('/', (req, res) => {
    res.json({'message': 'ok'});
  })

app.listen(
    port,
    () => console.log('hello world on http://localhost:${PORT}')
)