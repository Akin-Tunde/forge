import { createRequire } from 'module';
import path from 'path';
import fs from 'fs/promises';
import NetlifyAPI from "netlify";

const require = createRequire(import.meta.url);
const config = require('../config/app.json');

class NetlifyService {
  constructor(authToken, siteId) {
    if (typeof authToken !== 'string' || authToken.length < 20) {
      throw new Error('Invalid Netlify auth token');
    }
    
    this.authToken = authToken;
    this.siteId = siteId; // Keep this for fallback
    this.apiBase = 'https://api.netlify.com/api/v1';
    this.client = new NetlifyAPI(this.authToken) ;
  }

  async deployToNetlify(deployDir, landingName, metadata = {}) {
    try {
      const startTime = Date.now();
      console.log(`Starting deployment of ${landingName} from ${deployDir}`);
      
      // Create a unique site name with more randomness to avoid conflicts
      const cleanName = landingName.toLowerCase().replace(/[^\w-]/g, '-');
      const userIdentifier = metadata.authorFid || metadata.uniqueId || Math.random().toString(36).substring(2, 8);
      const timestamp = Date.now().toString().slice(-6);
      const randomString = Math.random().toString(36).substring(2, 10);
      const siteName = `landing-${cleanName}-${userIdentifier}-${timestamp}-${randomString}`;
      
      // Create site with retry logic for duplicate names
      console.log(`Creating new Netlify site: ${siteName}`);
      const site = await this.createSite(siteName);
      console.log(`Site created with ID: ${site.id} and name: ${site.name}`);
      
      // Read files from directory
      const files = await this.prepareFilesForClient(deployDir);
      console.log(`Prepared ${Object.keys(files).length} files for deployment`);
      
      // Deploy to the site using the client library
      console.log(`Deploying files to site: ${site.name} (${site.id})`);
      const deploy = await this.client.createSiteDeploy({
        siteId: site.id,
        body: {
          files,
          functions: {}
        }
      });
      
      console.log(`Deploy created with ID: ${deploy.id}, state: ${deploy.state}`);
      
      // Wait for deployment to be ready
      console.log('Waiting for deployment to complete...');
      const readyDeploy = await this.waitForDeployReady(site.id, deploy.id);
      console.log(`Deployment is now in state: ${readyDeploy.state}`);
      
      // Performance metrics
      console.log(`Deployment time: ${Date.now() - startTime}ms`);
      
      // Get the site URL
      const siteUrl = `https://${site.name}.netlify.app`;
      console.log(`Successfully deployed to ${siteUrl}`) ;
      
      // Store ownership information for future updates
      await this.storeOwnershipRecord({
        siteId: site.id,
        siteName: site.name,
        url: siteUrl,
        authorFid: metadata.authorFid,
        authorUsername: metadata.authorUsername,
        landingName: landingName,
        deploymentTimestamp: new Date().toISOString()
      });
      
      return {
        id: deploy.id,
        url: siteUrl,
        siteId: site.id,
        siteName: site.name,
        landingName: landingName
      };
    } catch (error) {
      console.error('Deployment Error:', error);
      throw new Error(`Netlify deployment failed: ${error.message}`);
    }
  }
  
  async createSite(siteName, retryCount = 0) {
    try {
      console.log(`Attempting to create site: ${siteName}`);
      const site = await this.client.createSite({
        body: {
          name: siteName
        }
      });
      return site;
    } catch (error) {
      console.error('Site creation error:', error.message);
      
      // If it's a duplicate name error and we haven't retried too many times
      if (error.message.includes('must be unique') && retryCount < 3) {
        // Generate a new name with more randomness
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substring(2, 10);
        const newSiteName = `${siteName}-${timestamp}-${random}`;
        
        console.log(`Site name ${siteName} already taken, retrying with: ${newSiteName}`);
        
        // Retry with the new name
        return await this.createSite(newSiteName, retryCount + 1);
      }
      
      throw error;
    }
  }
  
  async waitForDeployReady(siteId, deployId, maxAttempts = 15) {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const deploy = await this.client.getSiteDeploy({
          siteId,
          deployId
        });
        
        console.log(`Deploy status check ${i+1}/${maxAttempts}: ${deploy.state}`);
        
        if (deploy.state === 'ready') {
          return deploy;
        }
        
        // Wait 2 seconds before checking again
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        console.warn(`Error checking deploy status: ${error.message}`);
        // Continue trying despite errors
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    console.warn('Deploy processing timed out, but continuing anyway');
    return { state: 'timeout' };
  }
  
  async verifySiteExists(siteUrl) {
    try {
      const response = await fetch(siteUrl, {
        method: 'HEAD'
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  }
  
  async storeOwnershipRecord(ownershipData) {
    try {
      // Create data directory if it doesn't exist
      const dataDir = path.join(process.cwd(), 'data');
      await fs.mkdir(dataDir, { recursive: true });
      
      const ownershipFile = path.join(dataDir, 'site-ownership.json');
      
      // Read existing records
      let records = [];
      try {
        const data = await fs.readFile(ownershipFile, 'utf8');
        records = JSON.parse(data);
      } catch (error) {
        // File doesn't exist yet or is invalid, start with empty array
        console.log('Creating new ownership records file');
      }
      
      // Add the new record
      records.push(ownershipData);
      
      // Write back to file
      await fs.writeFile(ownershipFile, JSON.stringify(records, null, 2));
      
      console.log(`Stored ownership record for site: ${ownershipData.siteName}`);
      return true;
    } catch (error) {
      console.error('Error storing ownership record:', error);
      return false;
    }
  }
  
  async checkSiteOwnership(siteName, authorFid) {
    try {
      const ownershipFile = path.join(process.cwd(), 'data', 'site-ownership.json');
      
      // Read ownership records
      const data = await fs.readFile(ownershipFile, 'utf8');
      const records = JSON.parse(data);
      
      // Find the record for this site
      const record = records.find(r => r.siteName === siteName);
      
      if (!record) {
        return { isOwner: false, error: 'Site not found' };
      }
      
      // Check if the author FID matches
      return { 
        isOwner: record.authorFid === authorFid,
        record
      };
    } catch (error) {
      console.error('Error checking site ownership:', error);
      return { isOwner: false, error: error.message };
    }
  }
  
  async updateSite(siteId, deployDir, landingName, metadata = {}) {
    try {
      const startTime = Date.now();
      console.log(`Starting update of site ${siteId} with ${landingName} from ${deployDir}`);
      
      // Read files from directory
      const files = await this.prepareFilesForClient(deployDir);
      console.log(`Prepared ${Object.keys(files).length} files for update`);
      
      // Deploy to the site using the client library
      console.log(`Deploying files to site ID: ${siteId}`);
      const deploy = await this.client.createSiteDeploy({
        siteId,
        body: {
          files,
          functions: {}
        }
      });
      
      console.log(`Deploy created with ID: ${deploy.id}, state: ${deploy.state}`);
      
      // Wait for deployment to be ready
      console.log('Waiting for deployment to complete...');
      const readyDeploy = await this.waitForDeployReady(siteId, deploy.id);
      console.log(`Deployment is now in state: ${readyDeploy.state}`);
      
      // Performance metrics
      console.log(`Update time: ${Date.now() - startTime}ms`);
      
      // Get the site details to return the URL
      const site = await this.client.getSite({ siteId });
      const siteUrl = `https://${site.name}.netlify.app`;
      console.log(`Successfully updated site: ${siteUrl}`) ;
      
      return {
        id: deploy.id,
        url: siteUrl,
        siteId: siteId,
        siteName: site.name,
        landingName: landingName
      };
    } catch (error) {
      console.error('Site update error:', error);
      throw new Error(`Failed to update site: ${error.message}`);
    }
  }
  
  async prepareFilesForClient(deployDir) {
    const files = {};
    const entries = await fs.readdir(deployDir, { withFileTypes: true });
    
    // Process directory files
    for (const entry of entries) {
      if (entry.isFile()) {
        const filePath = path.join(deployDir, entry.name);
        const content = await fs.readFile(filePath, 'utf8');
        files[entry.name] = content;
      }
    }
    
    // Add required Netlify configuration files if they don't exist
    if (!files['_redirects']) {
      files['_redirects'] = `
/ /index.html 200
/* /index.html 404
      `;
    }
    
    if (!files['_headers']) {
      files['_headers'] = `
/*
  Cache-Control: public, max-age=3600
      `;
    }
    
    // Add metadata file
    files['deployment-meta.json'] = JSON.stringify({
      name: deployDir,
      generatedAt: new Date().toISOString()
    });
    
    if (!files['index.html']) {
      throw new Error('No index.html file found in deployment directory');
    }
    
    return files;
  }
}

export default NetlifyService;
