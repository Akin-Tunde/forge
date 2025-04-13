import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import GeminiService from './geminiService.js';
import NetlifyService from './netlifyService.js';
import { storeDeploymentOwnership, getSiteDetails } from './ownershipStore.js';

// Get directory name equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class LandingPageProcessor {
  constructor() {
    if (!process.env.GEMINI_API_KEY || !process.env.NETLIFY_AUTH_TOKEN || !process.env.NETLIFY_SITE_ID) {
      throw new Error('Missing required environment variables');
    }
    
    this.geminiService = new GeminiService(process.env.GEMINI_API_KEY);
    this.netlifyService = new NetlifyService(
      process.env.NETLIFY_AUTH_TOKEN,
      process.env.NETLIFY_SITE_ID
    );
  }

  async processRequest(request) {
    try {
      console.log(`Processing request for landing page: ${request.landingPageDetails.landingName}`);
      
      // Generate landing page
      const result = await this.geminiService.generateLandingPage(request.landingPageDetails);
      
      // Save to filesystem
      const saveResult = await this.geminiService.saveLandingPage(result.html, request.landingPageDetails.landingName);

      // Check if saveResult is a string or an object
      const directoryPath = typeof saveResult === 'string' 
        ? path.dirname(saveResult) 
        : (saveResult.outputDir || path.dirname(saveResult.htmlPath));
      
      // Deploy to Netlify
      const deploymentDetails = await this.netlifyService.deployToNetlify(
        directoryPath,
        request.landingPageDetails.landingName,
        {
          authorFid: request.authorFid,
          authorUsername: request.authorUsername
        }
      );
      
      // Store ownership information
      await storeDeploymentOwnership({
        siteId: deploymentDetails.siteId,
        siteName: deploymentDetails.siteName,
        url: deploymentDetails.url,
        authorFid: request.authorFid,
        authorUsername: request.authorUsername,
        landingName: request.landingPageDetails.landingName,
        deploymentTimestamp: new Date().toISOString()
      });

      return {
        castId: request.castId,
        authorFid: request.authorFid,
        authorUsername: request.authorUsername,
        landingName: request.landingPageDetails.landingName,
        deploymentUrl: deploymentDetails.url,
        deploymentId: deploymentDetails.id
      };
    } catch (error) {
      console.error('Error processing request:', error);
      throw new Error(`Failed to process request: ${error.message}`);
    }
  }
  
  /**
   * Process an update request for an existing site
   * @param {object} request - The update request
   * @returns {Promise<object>} - Result of the update
   */
  async processUpdateRequest(request) {
    try {
      console.log(`Processing update request for site: ${request.updateDetails.siteName}`);
      
      // Get the site details from ownership records
      const siteDetails = await getSiteDetails(request.updateDetails.siteName);
      
      if (!siteDetails) {
        throw new Error(`Site not found: ${request.updateDetails.siteName}`);
      }
      
      // Generate updated landing page
      const result = await this.geminiService.generateLandingPage({
        landingName: request.updateDetails.landingName,
        description: request.updateDetails.description,
        purpose: request.updateDetails.purpose
      });
      
      // Save to filesystem
      const saveResult = await this.geminiService.saveLandingPage(result.html, request.updateDetails.landingName);

      // Check if saveResult is a string or an object
      const directoryPath = typeof saveResult === 'string' 
        ? path.dirname(saveResult) 
        : (saveResult.outputDir || path.dirname(saveResult.htmlPath));
      
      // Deploy to the existing site
      const deploymentDetails = await this.netlifyService.updateSite(
        siteDetails.siteId,
        directoryPath,
        request.updateDetails.landingName
      );
      
      return {
        castId: request.castId,
        authorFid: request.authorFid,
        authorUsername: request.authorUsername,
        landingName: request.updateDetails.landingName,
        deploymentUrl: siteDetails.url,
        isUpdate: true
      };
    } catch (error) {
      console.error('Error processing update request:', error);
      throw new Error(`Failed to process update request: ${error.message}`);
    }
  }
}

export default LandingPageProcessor;
