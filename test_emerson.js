const fs = require('fs');
fetch('http://localhost:3000/api/player/emerson-palmieri-dos-santos')
  .then(res => res.json())
  .then(data => console.log(JSON.stringify(data, null, 2)))
  .catch(console.error);
