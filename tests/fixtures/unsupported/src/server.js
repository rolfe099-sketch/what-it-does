// A framework we can recognise but not read. The point of the fixture is the
// message the tool gives, not the code.
const express = require('express');
const app = express();
app.post('/api/charge', (req, res) => res.sendStatus(200));
app.listen(3000);
