const http = require('http');
const fs = require('fs');
const path = require('path');

http.createServer((req, res) => {
  let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);
  // Retirer les query params
  filePath = filePath.split('?')[0];

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // Fallback vers index.html pour les routes SPA
      fs.readFile(path.join(__dirname, 'index.html'), (err2, data2) => {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(data2);
      });
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(data);
  });
}).listen(3000, () => console.log('CRM ouvert sur http://localhost:3000'));
