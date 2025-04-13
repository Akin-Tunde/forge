import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Get directory name equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to the ownership records file
const OWNERSHIP_FILE = path.join(__dirname, '../data/site-ownership.json');

/**
 * Store deployment ownership information
 * @param {object} ownershipData - Data about site ownership
 * @returns {Promise<boolean>} - Success status
 */
export async function storeDeploymentOwnership(ownershipData) {
  try {
    // Ensure the data directory exists
    await fs.mkdir(path.dirname(OWNERSHIP_FILE), { recursive: true });
    
    // Read existing records
    let records = [];
    try {
      const data = await fs.readFile(OWNERSHIP_FILE, 'utf8');
      records = JSON.parse(data);
    } catch (error) {
      // File doesn't exist yet or is invalid, start with empty array
      console.log('Creating new ownership records file');
    }
    
    // Add the new record
    records.push(ownershipData);
    
    // Write back to file
    await fs.writeFile(OWNERSHIP_FILE, JSON.stringify(records, null, 2));
    
    console.log(`Stored ownership record for site: ${ownershipData.siteName}`);
    return true;
  } catch (error) {
    console.error('Error storing ownership data:', error);
    return false;
  }
}

/**
 * Get all ownership records
 * @returns {Promise<Array>} - Array of ownership records
 */
export async function getOwnershipRecords() {
  try {
    const data = await fs.readFile(OWNERSHIP_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    // File doesn't exist yet or is invalid
    console.log('No ownership records found or error reading file:', error.message);
    return [];
  }
}

/**
 * Get site details by site name
 * @param {string} siteName - Name of the site to find
 * @returns {Promise<object|null>} - Site details or null if not found
 */
export async function getSiteDetails(siteName) {
  try {
    const records = await getOwnershipRecords();
    return records.find(record => record.siteName === siteName) || null;
  } catch (error) {
    console.error('Error getting site details:', error);
    return null;
  }
}

/**
 * Check if a user is the owner of a site
 * @param {string} siteName - Name of the site
 * @param {string|number} authorFid - Farcaster ID of the author
 * @returns {Promise<boolean>} - True if the user is the owner
 */
export async function checkSiteOwnership(siteName, authorFid) {
  try {
    const records = await getOwnershipRecords();
    const record = records.find(r => r.siteName === siteName);
    
    // Check if the record exists and the author FID matches
    return record && record.authorFid.toString() === authorFid.toString();
  } catch (error) {
    console.error('Error checking site ownership:', error);
    return false;
  }
}
