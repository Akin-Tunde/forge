import { jest } from '@jest/globals';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { expect } from 'chai';
import fs from 'fs/promises';

// ES Modules alternative for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env.test') });

// Mock data for testing
const mockLandingPageDetails = {
  landingName: 'Test Landing Page',
  description: 'A test landing page for end-to-end testing',
  purpose: 'Testing the Farcaster landing page generator',
  timestamp: new Date().toISOString()
};

const mockRequest = {
  castId: 'test-cast-id',
  authorFid: 'test-author-fid',
  landingPageDetails: mockLandingPageDetails
};

describe('End-to-End Workflow Test', function() {
  this.timeout(30000);
  
  let geminiService;
  let netlifyService;
  let responseService;
  let processor;
  let testDir;
  
  before(async function() {
    // Dynamically import ES Modules
    const { default: GeminiService } = await import('../src/geminiService.js');
    const { default: NetlifyService } = await import('../src/netlifyService.js');
    const { default: ResponseService } = await import('../src/responseService.js');
    const { default: LandingPageProcessor } = await import('../src/processor.js');

    try {
      geminiService = new GeminiService(process.env.GEMINI_API_KEY);
      netlifyService = new NetlifyService(
        process.env.NETLIFY_AUTH_TOKEN,
        process.env.NETLIFY_SITE_ID
      );
      responseService = new ResponseService(process.env.NEYNAR_API_KEY);
      processor = new LandingPageProcessor();
      
      testDir = path.join(__dirname, 'temp-test-dir');
    } catch (error) {
      console.error('Test setup failed:', error);
      throw error;
    }
  });

  after(async function() {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      console.warn('Test cleanup warning:', error);
    }
  });
  
  it('should generate a landing page with Gemini AI', async function() {
    const result = await geminiService.generateLandingPage(mockLandingPageDetails);
    
    expect(result).to.be.an('object');
    expect(result.html).to.be.a('string').that.includes('<!DOCTYPE html>');
    expect(result.landingName).to.equal(mockLandingPageDetails.landingName);
    expect(result.timestamp).to.be.a('string');
  });
  
  it('should deploy a landing page to Netlify', async function() {
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Test Landing Page</title>
        </head>
        <body>
          <h1>${mockLandingPageDetails.landingName}</h1>
          <p>${mockLandingPageDetails.description}</p>
        </body>
      </html>
    `;
    
    await fs.mkdir(testDir, { recursive: true });
    const testFilePath = path.join(testDir, 'index.html');
    await fs.writeFile(testFilePath, htmlContent);
    
    const result = await netlifyService.deployToNetlify(
      testDir,
      mockLandingPageDetails.landingName,
      {
        test: true,
        castId: mockRequest.castId
      }
    );
    
    expect(result).to.be.an('object');
    expect(result.id).to.be.a('string');
    expect(result.url).to.include('netlify.app');
    expect(result.deployPath).to.be.a('string');
    expect(result.logs).to.include('netlify.app');
  });
  
  it('should send a response with the landing page URL', async function() {
    const deploymentDetails = {
      castId: mockRequest.castId,
      authorFid: mockRequest.authorFid,
      landingName: mockLandingPageDetails.landingName,
      deploymentUrl: 'https://test-landing-page.netlify.app'
    };
    
    const result = await responseService.sendResponse(deploymentDetails);
    
    expect(result).to.be.an('object');
    expect(result.success).to.be.true;
    expect(result.responseHash).to.be.a('string');
    expect(result.timestamp).to.be.a('string');
  });
  
  it('should process a landing page request end-to-end', async function() {
    jest.spyOn(geminiService, 'generateLandingPage').mockResolvedValue({
      html: '<html>Test</html>',
      landingName: mockLandingPageDetails.landingName
    });
    
    jest.spyOn(netlifyService, 'deployToNetlify').mockResolvedValue({
      id: 'mock-deploy-id',
      url: 'https://mock-landing.netlify.app',
      deployPath: '/landing/mock-page'
    });
    
    jest.spyOn(responseService, 'sendResponse').mockResolvedValue({
      success: true,
      responseHash: 'mock-response-hash'
    });
    
    const result = await processor.processRequest(mockRequest);
    
    expect(result).to.be.an('object');
    expect(result.castId).to.equal(mockRequest.castId);
    expect(result.authorFid).to.equal(mockRequest.authorFid);
    expect(result.landingName).to.equal(mockLandingPageDetails.landingName);
    expect(result.deploymentUrl).to.include('netlify.app');
    
    jest.restoreAllMocks();
  });
});