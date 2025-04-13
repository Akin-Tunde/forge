import LandingPageProcessor from './processor.js';

class QueueProcessor {
  constructor(app) {
    this.app = app;
    this.processor = new LandingPageProcessor();
    this.isProcessing = false;
    this.responseService = null;
  }

  /**
   * Set the response service for sending replies to users
   * 
   * @param {object} responseService - Service for sending responses
   */
  setResponseService(responseService) {
    this.responseService = responseService;
  }

  /**
   * Start processing the queue
   */
  start() {
    // Process the queue every 5 seconds (reduced from 10 for faster responses)
    setInterval(() => this.processQueue(), 5000);
    console.log('Queue processor started');
  }

  /**
   * Process the next item in the queue
   */
  async processQueue() {
    if (this.isProcessing) {
      return;
    }

    const queue = this.app.locals.queue || [];
    if (queue.length === 0) {
      return;
    }

    try {
      this.isProcessing = true;
      const request = queue.shift();
      
      // Handle different types of requests
      if (request.isHelpRequest) {
        // Process help request
        console.log(`Processing help request from user ${request.authorUsername || request.authorFid}`);
        
        // Send help response directly
        if (this.responseService) {
          await this.responseService.sendResponse(request);
          console.log(`Help response sent successfully`);
        } else {
          console.error('Response service not available for help request');
        }
      } 
      else if (request.isGeneralMention) {
        // Process general mention
        console.log(`Processing general mention from user ${request.authorUsername || request.authorFid}: "${request.mentionText}"`);
        
        // Send general response
        if (this.responseService) {
          await this.responseService.sendResponse(request);
          console.log(`General mention response sent successfully`);
        } else {
          console.error('Response service not available for general mention');
        }
      }
      else if (request.isNotOwnerError) {
        // Process not owner error
        console.log(`Processing not owner error for user ${request.authorUsername || request.authorFid} and site ${request.siteName}`);
        
        // Send not owner error response
        if (this.responseService) {
          await this.responseService.sendResponse(request);
          console.log(`Not owner error response sent successfully`);
        } else {
          console.error('Response service not available for not owner error');
        }
      }
      else if (request.updateDetails) {
        // Process site update request
        console.log(`Processing update request for site: ${request.updateDetails.siteName}`);
        
        try {
          // Process the update request
          const result = await this.processor.processUpdateRequest(request);
          
          // Send response to the user if response service is available
          if (this.responseService) {
            await this.responseService.sendResponse(result);
            console.log(`Site update completed successfully: ${result.deploymentUrl}`);
          } else {
            console.error('Response service not available for site update');
          }
        } catch (processingError) {
          console.error('Error processing site update:', processingError);
          
          // Send error response if possible
          if (this.responseService) {
            await this.responseService.sendResponse({
              castId: request.castId,
              authorFid: request.authorFid,
              authorUsername: request.authorUsername,
              isGeneralMention: true,
              mentionText: `Error updating site: ${processingError.message}`
            });
          }
        }
      }
      else if (request.landingPageDetails) {
        // Process landing page request (original functionality)
        console.log(`Processing request for landing page: ${request.landingPageDetails.landingName}`);
        
        try {
          // Process the request
          const result = await this.processor.processRequest(request);
          
          // Add author username to result if available
          if (request.authorUsername) {
            result.authorUsername = request.authorUsername;
          }
          
          // Send response to the user if response service is available
          if (this.responseService) {
            await this.responseService.sendResponse(result);
            console.log(`Landing page deployed successfully: ${result.deploymentUrl}`);
          } else {
            console.error('Response service not available for landing page deployment');
          }
        } catch (processingError) {
          console.error('Error processing landing page request:', processingError);
          
          // Send error response if possible
          if (this.responseService) {
            await this.responseService.sendResponse({
              castId: request.castId,
              authorFid: request.authorFid,
              authorUsername: request.authorUsername,
              isGeneralMention: true,
              mentionText: "Error processing landing page request. Please try again with the correct format: (Name, Description, Purpose)"
            });
          }
        }
      } else {
        console.warn('Unknown request type in queue:', request);
      }
    } catch (error) {
      console.error('Error processing queue item:', error);
    } finally {
      this.isProcessing = false;
    }
  }
}

export default QueueProcessor;
