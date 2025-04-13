import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const config = require('../config/app.json');

// Pre-compile regex patterns for better performance
const VALIDATION_PATTERNS = [
  { 
    regex: /\(([^,]+),\s*([^,]+),\s*([^)]+)\)/,
    help: 'Use format: (Name, Description, Purpose)'
  },
  {
    regex: new RegExp(config.neynar.mentionFormat),
    help: config.neynar.mentionHelp || 'Use the specified format'
  }
];

// New pattern for update requests
const UPDATE_PATTERN = {
  regex: /update\s+([^:]+):\s*\(([^,]+),\s*([^,]+),\s*([^)]+)\)/i,
  help: 'Use format: update siteName: (Name, Description, Purpose)'
};

/**
 * Validates cast text and extracts landing page details
 * @param {string} castText - The text content of the Farcaster cast
 * @returns {{
 *   landingName: string,
 *   description: string,
 *   purpose: string,
 *   timestamp: string,
 *   help?: string
 * }|null} - Object with extracted details or null if invalid
 */
function validateFormat(castText) {
  if (typeof castText !== 'string') return null;

  for (const { regex } of VALIDATION_PATTERNS) {
    try {
      const match = castText.match(regex);
      if (match?.groups || match?.length >= 4) {
        const { 1: landingName, 2: description, 3: purpose } = match;
        
        if (landingName?.trim() && description?.trim() && purpose?.trim()) {
          return {
            landingName: landingName.trim(),
            description: description.trim(),
            purpose: purpose.trim(),
            timestamp: new Date().toISOString()
          };
        }
      }
    } catch (error) {
      console.error('Pattern matching error:', error);
    }
  }
  
  return null;
}

/**
 * Validates update request format
 * @param {string} castText - The text content of the Farcaster cast
 * @returns {{
 *   siteName: string,
 *   landingName: string,
 *   description: string,
 *   purpose: string,
 *   isUpdate: boolean,
 *   timestamp: string
 * }|null} - Object with extracted details or null if invalid
 */
function validateUpdateFormat(castText) {
  if (typeof castText !== 'string') return null;
  
  try {
    const match = castText.match(UPDATE_PATTERN.regex);
    if (match?.length >= 5) {
      const siteName = match[1].trim();
      const landingName = match[2].trim();
      const description = match[3].trim();
      const purpose = match[4].trim();
      
      if (siteName && landingName && description && purpose) {
        return {
          siteName,
          landingName,
          description,
          purpose,
          isUpdate: true,
          timestamp: new Date().toISOString()
        };
      }
    }
  } catch (error) {
    console.error('Update pattern matching error:', error);
  }
  
  return null;
}

/**
 * Gets help message for the required format
 */
function getFormatHelp(castText) {
  // Check if it's an update request
  if (castText.toLowerCase().includes('update')) {
    return UPDATE_PATTERN.help;
  }
  
  // Regular landing page request
  for (const { regex, help } of VALIDATION_PATTERNS) {
    if (regex.test(castText)) return help;
  }
  return VALIDATION_PATTERNS[0].help; // Default to first format's help
}

/**
 * Gets help message for update format
 */
function getUpdateFormatHelp() {
  return UPDATE_PATTERN.help;
}

export { 
  validateFormat, 
  validateUpdateFormat, 
  getFormatHelp,
  getUpdateFormatHelp
};
