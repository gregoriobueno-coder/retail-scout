const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3060;

// Serve static files from the root of the retail-scout directory
app.use(express.static(__dirname));

let activeProcess = null;

// Server-Sent Events (SSE) endpoint to stream scraper stdout/stderr to the browser client in real-time
app.get('/api/run-scraper', (req, res) => {
  if (activeProcess) {
    return res.status(409).json({ error: 'Scraper run is already in progress' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendSSE = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  sendSSE('status', { message: 'Initializing scraper orchestrator...' });

  // Spawn node index.js to run the scraper
  activeProcess = spawn('node', ['index.js'], { cwd: __dirname });

  activeProcess.stdout.on('data', (data) => {
    const lines = data.toString().split('\n').filter(Boolean);
    for (const line of lines) {
      sendSSE('log', { message: line });
    }
  });

  activeProcess.stderr.on('data', (data) => {
    const lines = data.toString().split('\n').filter(Boolean);
    for (const line of lines) {
      sendSSE('error', { message: line });
    }
  });

  activeProcess.on('close', (code) => {
    activeProcess = null;
    if (code === 0) {
      sendSSE('status', { message: 'Scraper run completed successfully! Compiling fresh dashboard...', done: true });
    } else {
      sendSSE('status', { message: `Scraper failed with exit code ${code}`, done: true, failed: true });
    }
    res.end();
  });
});

app.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(`🐻 Wandering Bear Local Server Running`);
  console.log(`🌐 Local dashboard: http://localhost:${PORT}`);
  console.log(`==================================================`);
});
