import express from 'express';
import { createRequire } from 'module';
import { validateFormat, validateUpdateFormat, getFormatHelp } from './validator.js';
import { checkSiteOwnership } from './ownershipStore.js';

const router = express.Router();
const require = createRequire(import.meta.url);
const config = require('../config/app.json');

// Store the bot start time to ignore mentions before this time
const BOT_START_TIME = new Date();
console.log(`Bot started at: ${BOT_START_TIME.toISOString()}`);

/**
 * Farcaster webhook endpoint to listen for bot mentions
 */
router.post(config.neynar.webhookPath, async (req, res) => {
  try {
    // Extract the cast data from the webhook payload
    // Neynar's webhook format changed - data is now nested under 'data'
    const webhookData = req.body.data || req.body;
    const cast = webhookData.cast || webhookData;
    
    // Get mentioned profiles from the correct location in the payload
    const mentionedProfiles = webhookData.mentioned_profiles || [];
    
    // Check if the bot was mentioned OR if it's a reply to the bot
    const BOT_FID = process.env.FARCASTER_BOT_FID || "1042522"; // Use environment variable or fallback
    
    // Check mentions in two possible locations:
    // 1. In the root level mentioned_fids (old format)
    // 2. In the data.mentioned_profiles array (new format)
    const mentionedFids = req.body.mentioned_fids || [];
    const mentionedProfileFids = mentionedProfiles.map(profile => profile.fid.toString());
    
    // Also check if this is in the new webhook format where mentioned profiles are in data.mentioned_profiles
    const dataProfiles = webhookData.mentioned_profiles || [];
    const dataProfileFids = dataProfiles.map(profile => profile.fid.toString());
    
    // Combine all possible locations where the bot FID might be mentioned
    const allMentionedFids = [...mentionedFids, ...mentionedProfileFids, ...dataProfileFids];
    
    console.log(`Checking if bot FID ${BOT_FID} is in mentioned FIDs:`, allMentionedFids);
    
    const isBotMentioned = allMentionedFids.includes(BOT_FID.toString());
    const isReplyToBot = (cast.parent_author && cast.parent_author.fid === BOT_FID) || 
                         (req.body.parent_author_fid === BOT_FID);

    // CRITICAL FIX: Check if the author of the cast is the bot itself
    // If the cast is from the bot, ignore it to prevent infinite loops
    if (cast.author && cast.author.fid.toString() === BOT_FID.toString()) {
      console.log(`Ignoring cast from bot itself (FID: ${cast.author.fid}) to prevent infinite loops`);
      return res.status(200).json({ status: "ignored", reason: "self_cast" });
    }

    if (!isBotMentioned && !isReplyToBot) {
      console.log("Ignoring: Not a mention or reply to the bot");
      return res.status(200).json({ status: "ignored" });
    }

    if (!cast || !cast.text) {
      console.log("Invalid webhook payload: missing cast data");
      return res.status(400).json({ error: "Invalid payload" });
    }

    // Enhanced logging for user and cast details
    console.log('\n========== USER DETAILS ==========');
    console.log(`User FID: ${cast.author.fid}`);
    console.log(`Username: ${cast.author.username || 'Not available'}`);
    console.log(`Display Name: ${cast.author.display_name || 'Not available'}`);
    console.log('==================================\n');

    console.log('========== CAST DETAILS ==========');
    console.log(`Cast ID/Hash: ${cast.hash || cast.id || 'Not available'}`);
    console.log(`Cast Text: "${cast.text}"`);
    console.log(`Cast Timestamp: ${cast.timestamp ? new Date(cast.timestamp).toISOString() : 'Not available'}`);
    console.log('==================================\n');

    // Check if the cast timestamp is available
    if (cast.timestamp) {
      // Convert timestamp to Date object (assuming timestamp is in milliseconds)
      const castTime = new Date(cast.timestamp);
      
      // If the cast was created before the bot started, ignore it
      if (castTime < BOT_START_TIME) {
        console.log(`Ignoring mention from ${cast.author.fid} as it occurred before bot startup`);
        return res.status(200).json({ status: "ignored", reason: "before_startup" });
      }
    } else {
      console.log("Cast timestamp not available, processing anyway");
    }

    console.log(`Received mention: "${cast.text}" from user ${cast.author.fid}`);

    // Check if this is a help request - look for "help" or "?" anywhere in the text
    // Also handle "@bot help" format by checking for mentions with help
    const isHelpRequest = cast.text.toLowerCase().includes('help') || 
                          cast.text.toLowerCase().includes('?');
    
    if (isHelpRequest) {
      // Queue a help response
      console.log("Detected help request, queueing help response");
      req.app.locals.queue.push({
        castId: cast.hash || cast.id,
        authorFid: cast.author.fid,
        authorUsername: cast.author.username,
        isHelpRequest: true
      });
      
      return res.status(200).json({ status: "queued", type: "help_request" });
    }

    // NEW: Check if this is an update request
    const updateDetails = validateUpdateFormat(cast.text);
    if (updateDetails) {
      console.log(`Detected update request for site ${updateDetails.siteName}, checking ownership`);
      
      // Check if the user is the owner of the site
      const isOwner = await checkSiteOwnership(updateDetails.siteName, cast.author.fid);
      
      if (isOwner) {
        // Queue the update request
        console.log(`User ${cast.author.fid} is the owner, queueing update request`);
        
        req.app.locals.queue.push({
          castId: cast.hash || cast.id,
          authorFid: cast.author.fid,
          authorUsername: cast.author.username,
          updateDetails,
        });
        
        return res.status(200).json({ status: "queued", type: "site_update" });
      } else {
        // Queue a response indicating the user is not the owner
        console.log(`User ${cast.author.fid} is NOT the owner of ${updateDetails.siteName}, queueing error response`);
        
        req.app.locals.queue.push({
          castId: cast.hash || cast.id,
          authorFid: cast.author.fid,
          authorUsername: cast.author.username,
          isNotOwnerError: true,
          siteName: updateDetails.siteName
        });
        
        return res.status(200).json({ status: "queued", type: "not_owner_error" });
      }
    }

    // Check if this is a landing page request (original functionality)
    const landingPageDetails = validateFormat(cast.text);
    if (landingPageDetails) {
      // Queue the landing page request (original functionality)
      console.log("Detected landing page request, queueing for processing");
      console.log("Landing page details:", JSON.stringify(landingPageDetails, null, 2));
      
      req.app.locals.queue.push({
        castId: cast.hash || cast.id,
        authorFid: cast.author.fid,
        authorUsername: cast.author.username,
        landingPageDetails,
      });
      
      return res.status(200).json({ status: "queued", type: "landing_page" });
    }
    
    // If we get here, it's a general mention that doesn't match any specific format
    // Queue a general response
    console.log("Detected general mention, queueing general response");
    req.app.locals.queue.push({
      castId: cast.hash || cast.id,
      authorFid: cast.author.fid,
      authorUsername: cast.author.username,
      isGeneralMention: true,
      mentionText: cast.text
    });
    
    return res.status(200).json({ status: "queued", type: "general_mention" });
    
  } catch (error) {
    console.error("Webhook error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
