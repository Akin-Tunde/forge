import express from 'express';
import dotenv from 'dotenv';
import farcasterListener from './farcasterListener.js';
import QueueProcessor from './queueProcessor.js';
import ResponseService from './responseService.js';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Get directory name equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create require for JSON imports
const require = createRequire(import.meta.url);
const config = require('../config/app.json');

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
app.use(express.json());

// Initialize the queue
app.locals.queue = [];

// Register the Farcaster listener routes
app.use('/', farcasterListener);

// Initialize the response service
const responseService = new ResponseService(process.env.NEYNAR_API_KEY);

// Initialize and start the queue processor
const queueProcessor = new QueueProcessor(app);
queueProcessor.setResponseService(responseService);
queueProcessor.start();

// Add a health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});



// Start server
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Webhook endpoint: ${config.neynar.webhookPath}`);
});

export { app, server };