import { NeynarAPIClient, Configuration } from "@neynar/nodejs-sdk";
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY;

// Validate API key presence
if (!NEYNAR_API_KEY) {
  throw new Error("NEYNAR_API_KEY is not configured in environment variables");
}

// Create configuration
const config = new Configuration({
  apiKey: NEYNAR_API_KEY,
});

// Initialize client
const neynarClient = new NeynarAPIClient(config);

// Test connection on startup
(async () => {
  try {
    // Correctly structured parameter
    await neynarClient.fetchBulkUsers({
      fids: [process.env.FARCASTER_BOT_FID || 1042522], // Use bot's FID from env or fallback
      viewerFid: undefined // Optional viewer context
    });
    console.log("✅ Neynar client initialized successfully");
  } catch (error) {
    console.error("❌ Failed to initialize Neynar client:", error);
    process.exit(1);
  }
})();

export default neynarClient;
