const express = require('express');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3060;

app.use(express.static(__dirname));

let activeRun = false;

app.get('/api/run-scraper', async (req, res) => {
  if (activeRun) {
    return res.status(409).json({ error: 'Scraper run is already in progress' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendSSE = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (!token) {
    sendSSE('status', { message: 'Error: GITHUB_TOKEN is not configured in your local .env file. Please check settings.', done: true, failed: true });
    return res.end();
  }

  activeRun = true;
  sendSSE('status', { message: 'Triggering GitHub Actions workflow on-demand...' });

  const owner = 'gregoriobueno-coder';
  const repo = 'retail-scout';
  const workflowId = 'sync-rates.yml';

  try {
    // 1. Dispatch workflow
    await axios.post(
      `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`,
      { ref: 'main' },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28'
        }
      }
    );

    sendSSE('log', { message: 'Workflow dispatch request sent successfully.' });
    sendSSE('status', { message: 'Waiting for GitHub runner to queue run...' });

    // 2. Poll runs list to find our run ID
    let runId = null;
    let attempts = 0;
    while (!runId && attempts < 10) {
      attempts++;
      await new Promise(r => setTimeout(r, 3000));
      
      const runsRes = await axios.get(
        `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowId}/runs?per_page=3`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28'
          }
        }
      );
      
      const runs = runsRes.data.workflow_runs;
      if (runs && runs.length > 0) {
        const matchingRun = runs.find(r => r.status === 'queued' || r.status === 'in_progress') || runs[0];
        if (matchingRun) {
          runId = matchingRun.id;
          sendSSE('log', { message: `Matched workflow run ID: ${runId} (Status: ${matchingRun.status})` });
        }
      }
    }

    if (!runId) {
      throw new Error('Timed out waiting for GitHub to register the workflow run.');
    }

    // 3. Poll specific run until completion
    let status = 'queued';
    let conclusion = null;
    while (status !== 'completed') {
      await new Promise(r => setTimeout(r, 5000));

      const runStatusRes = await axios.get(
        `https://api.github.com/repos/${owner}/${repo}/actions/runs/${runId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28'
          }
        }
      );

      const runObj = runStatusRes.data;
      status = runObj.status;
      conclusion = runObj.conclusion;

      if (status === 'queued') {
        sendSSE('status', { message: 'Workflow run is queued on GitHub Actions...' });
      } else if (status === 'in_progress') {
        sendSSE('status', { message: 'Scraper execution is in progress on cloud runner...' });
        sendSSE('log', { message: `Runner state: in_progress. Check logs: ${runObj.html_url}` });
      }
    }

    // 4. Completed!
    if (conclusion === 'success') {
      sendSSE('status', { message: 'Cloud scraper completed successfully! Pulling latest rates to local machine...' });
      
      exec('git pull --rebase origin main', { cwd: __dirname }, (pullErr, stdout, stderr) => {
        activeRun = false;
        if (pullErr) {
          console.error('[Git Pull Error]', pullErr.message);
          sendSSE('status', { message: `Git Pull failed: ${pullErr.message}`, done: true, failed: true });
        } else {
          sendSSE('log', { message: 'Git pull completed successfully.' });
          sendSSE('status', { message: 'Sync succeeded! Reloading dashboard...', done: true });
        }
        res.end();
      });
    } else {
      activeRun = false;
      sendSSE('status', { message: `GitHub Actions workflow run ended with conclusion: ${conclusion}`, done: true, failed: true });
      res.end();
    }

  } catch (err) {
    activeRun = false;
    const errMsg = err.response ? `${err.response.status} ${err.response.statusText}` : err.message;
    console.error('[API Error]', errMsg);
    sendSSE('status', { message: `GitHub API call failed: ${errMsg}`, done: true, failed: true });
    res.end();
  }
});

app.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(`🐻 Wandering Bear Local Server Running`);
  console.log(`🌐 Local dashboard: http://localhost:${PORT}`);
  console.log(`==================================================`);
});
