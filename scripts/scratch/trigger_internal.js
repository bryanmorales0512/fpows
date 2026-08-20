
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Stub for getSimpro if not available, but I'll just copy the logic or require server.js
// Since server.js is a large file and not a module, I'll just extract the necessary function logic.

// Actually, let's just use the server and find out why CURL is hanging.
// Maybe I should use 127.0.0.1 instead of localhost.

const http = require('http');

const options = {
  hostname: '127.0.0.1',
  port: 3000,
  path: '/api/trigger-manager-report',
  method: 'GET'
};

const req = http.request(options, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  res.setEncoding('utf8');
  res.on('data', (chunk) => {
    console.log(`BODY: ${chunk}`);
  });
  res.on('end', () => {
    console.log('No more data in response.');
  });
});

req.on('error', (e) => {
  console.error(`problem with request: ${e.message}`);
});

req.end();
