import { NeynarAPIClient } from '@neynar/nodejs-sdk';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const config = require('../config/app.json');

class ResponseService {
  constructor(apiKey) {
    if (!apiKey) throw new Error('NEYNAR_API_KEY is required');
    if (!process.env.NEYNAR_SIGNER_UUID) throw new Error('NEYNAR_SIGNER_UUID is required');
    
    this.neynarClient = new NeynarAPIClient(apiKey);
    this.botUsername = process.env.FARCASTER_BOT_USERNAME || 'forg';
  }

  async sendResponse(result) {
    // Add validation to catch missing values
    if (!result.castId) {
      console.error('Missing castId in response data:', result);
      throw new Error('Cast ID is required for sending a response');
    }

    try {
      const { castId, authorFid, authorUsername } = result;
      const username = authorUsername || `user_${authorFid}`;
      
      console.log(`Sending response to cast ${castId} from user ${username}`);
      
      let message = '';
      let embeds = [];

      // Handle different types of responses
      if (result.isHelpRequest) {
        // Help request response
        message = `@${username} 🤖 How to use:
  
"@${this.botUsername} (Name, Description, Purpose)"
Example: "@${this.botUsername} (My Project, A cool new app, Collecting early signups)"

To update your existing landing page:
"@${this.botUsername} update siteName: (New Name, New Description, New Purpose)"
Example: "@${this.botUsername} update landing-my-project-abc123: (My Updated Project, An awesome app, Getting beta testers)"

I'll generate and deploy a landing page for you instantly!`;
      } 
      else if (result.isNotOwnerError) {
        // Not owner error response
        message = `@${username} ❌ Sorry, you don't have permission to update the site "${result.siteName}". Only the original creator can update it.`;
      }
      else if (result.isGeneralMention) {
        // General mention response
        message = `@${username} 👋 Thanks for the mention! I'm @${this.botUsername}, a bot that creates landing pages.

To use me, mention me with the format: (Name, Description, Purpose)

To update an existing page, use: update siteName: (Name, Description, Purpose)

Or type "@${this.botUsername} help" to learn more about what I can do.`;
      }
      else if (result.isUpdate) {
        // Landing page update response
        message = `@${username} 🔄 Your landing page "${result.landingName}" has been updated!\n\n${result.deploymentUrl}\n\n#FarcasterLanding`;
        embeds = [{ url: result.deploymentUrl }];
      }
      else if (result.landingName && result.deploymentUrl) {
        // Landing page deployment response (original functionality)
        message = `@${username} 🚀 Your landing page "${result.landingName}" is live!\n\n${result.deploymentUrl}\n\n#FarcasterLanding`;
        embeds = [{ url: result.deploymentUrl }];
      }
      
      console.log(`Preparing to send message: ${message}`);
      
      // Publish the cast reply
      const response = await this.neynarClient.publishCast(
        process.env.NEYNAR_SIGNER_UUID, // From your developer dashboard
        message,
        {
          replyTo: castId,
          embeds: embeds.length > 0 ? embeds : undefined
        }
      );
      
      console.log(`Response cast hash: ${response.hash}`);
      return response;
      
    } catch (error) {
      console.error('Neynar API Error:', {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message
      });
      throw new Error(`Failed to send response: ${error.response?.data?.message || error.message}`);
    }
  }
}

export default ResponseService;
