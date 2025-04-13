const express = require('express');
const dotenv = require('dotenv');
const { NeynarAPIClient } = require('@neynar/nodejs-sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const netlify = require('netlify');
const fs = require('fs');
const path = require('path');
const config = require('./config/app.json');

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
app.use(express.json());

// Initialize API clients
const neynarClient = new NeynarAPIClient(process.env.NEYNAR_API_KEY);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const netlifyClient = new netlify({
  accessToken: process.env.NETLIFY_AUTH_TOKEN
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
