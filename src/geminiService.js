import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs/promises';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const config = require('../config/app.json');

class GeminiService {
  constructor(apiKey) {
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is required');
    }
    
    this.apiKey = apiKey;
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({ model: config.gemini.model || 'gemini-1.5-pro-latest' });
    
    // Add retry and timeout configuration
    this.maxRetries = 3;
    this.timeout = 30000; // 30 seconds
    this.retryDelay = 2000; // 2 seconds
    
    // Ensure template path is defined with a fallback
    this.templatePath = config.gemini?.templatePath || 'templates/landing-template.txt';
    console.log(`Using template path: ${this.templatePath}`);
    
    // Set default output directory with fallback
    this.outputDir = config.gemini?.outputDir || path.join(process.cwd(), 'dist');
    console.log(`Using output directory: ${this.outputDir}`);
  }

  /**
   * Generate a landing page based on the provided details
   * 
   * @param {object} details - Landing page details
   * @returns {Promise<object>} - Generated landing page content
   */
  async generateLandingPage(details) {
    try {
      console.log(`Generating landing page for: ${details.landingName}`);
      
      // Add default values for missing fields
      const landingName = details.landingName || 'My Project';
      const description = details.description || 'A cool new app';
      const purpose = details.purpose || 'Collecting early signups';
      
      // Create a simplified prompt that requests a complete HTML file with embedded CSS and JS
      const prompt = `Create a complete landing page for ${landingName}, which is ${description}. The purpose is ${purpose}.
      
Please generate a SINGLE HTML FILE with embedded CSS (in style tags) and JavaScript (in script tags).
The landing page should include:
1. A clean, modern design with responsive layout
2. A hero section with a compelling headline and call-to-action
3. A features section highlighting key benefits
4. A sign-up form for collecting email addresses

IMPORTANT: Return ONLY the complete HTML file with embedded CSS and JavaScript. Do not use markdown code blocks.`;
      
      // Generate content with retry logic
      const content = await this.withRetry(async () => {
        try {
          // Add timeout to the fetch request
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), this.timeout);
          
          const result = await this.model.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.7,
              topK: 40,
              topP: 0.95,
              maxOutputTokens: 8192,
            },
            safetySettings: [
              { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
              { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
              { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
              { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
            ],
          }, { signal: controller.signal });
          
          clearTimeout(timeoutId);
          return result;
        } catch (error) {
          // Check if it's a network error and provide a more helpful message
          if (error.message.includes('fetch failed')) {
            console.error('Network error when connecting to Gemini API. Check your internet connection and proxy settings.');
            
            // Return null to trigger fallback
            return null;
          }
          throw error;
        }
      });
      
      // Process the response
      let html;
      
      if (content && content.response) {
        const text = content.response.text();
        console.log('Raw response length:', text.length);
        
        // Extract HTML content - simplified to just get the entire response
        // or find HTML if it's wrapped in markdown code blocks
        if (text.includes('<!DOCTYPE html>') || text.includes('<html')) {
          // Try to extract just the HTML if there's extra text
          const htmlMatch = text.match(/<!DOCTYPE html>[\s\S]*<\/html>/) || 
                           text.match(/<html[\s\S]*<\/html>/);
          
          if (htmlMatch) {
            html = htmlMatch[0];
          } else {
            // If we can't extract it cleanly, just use the whole text
            html = text;
          }
        } else if (text.match(/```html\s*([\s\S]*?)\s*```/)) {
          // Extract from markdown code block if present
          const match = text.match(/```html\s*([\s\S]*?)\s*```/);
          html = match[1];
        } else {
          // Just use the whole text as a last resort
          html = text;
        }
        
        console.log('HTML content extracted, length:', html.length);
      }
      
      // If no HTML content was generated or extraction failed, use fallback
      if (!html || html.length < 100 || !html.includes('<html')) {
        console.log('Using fallback template');
        html = this.getDefaultTemplate()
          .replace(/{{name}}/g, landingName)
          .replace(/{{description}}/g, description)
          .replace(/{{purpose}}/g, purpose);
      }
      
      return { html };
    } catch (error) {
      console.error('Error generating landing page:', error);
      
      // Generate fallback content
      const landingName = details.landingName || 'My Project';
      const description = details.description || 'A cool new app';
      const purpose = details.purpose || 'Collecting early signups';
      
      const html = this.getDefaultTemplate()
        .replace(/{{name}}/g, landingName)
        .replace(/{{description}}/g, description)
        .replace(/{{purpose}}/g, purpose);
      
      return { html };
    }
  }
  
  /**
   * Save the landing page content to files
   * This function is required by the processor.js file
   * 
   * @param {object} content - Landing page content
   * @param {string} outputDir - Directory to save the files (with fallback)
   * @returns {Promise<object>} - Paths to the saved files
   */
  async saveLandingPage(content, outputDir) {
    try {
      // Check if content is a string or an object
      let htmlContent;
      if (typeof content === 'string') {
        htmlContent = content;
      } else if (content && content.html) {
        htmlContent = content.html;
      } else {
        console.error('HTML content is undefined in saveLandingPage');
        // Generate minimal HTML as fallback
        htmlContent = `<!DOCTYPE html>
  <html>
  <head>
    <title>Fallback Page</title>
  </head>
  <body>
    <h1>Fallback Page</h1>
    <p>There was an issue generating your landing page.</p>
  </body>
  </html>`;
      }
      
      // Use provided outputDir or fall back to default if undefined
      const finalOutputDir = outputDir || this.outputDir;
      
      console.log(`Saving landing page to ${finalOutputDir}`);
      
      // Create the output directory if it doesn't exist
      await fs.mkdir(finalOutputDir, { recursive: true });
      
      // Save HTML file
      const htmlPath = path.join(finalOutputDir, 'index.html');
      await fs.writeFile(htmlPath, htmlContent);
      
      return {
        htmlPath,
        outputDir: finalOutputDir
      };
    } catch (error) {
      console.error('Error saving landing page:', error);
      throw new Error(`Failed to save landing page: ${error.message}`);
    }
  }
  

  /**
   * Get a default template for landing pages
   * 
   * @returns {string} - Default template
   */
  getDefaultTemplate() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{name}}</title>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      line-height: 1.6;
      margin: 0;
      padding: 0;
      color: #333;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 0 20px;
    }
    header {
      background: linear-gradient(135deg, #6e8efb, #a777e3);
      color: white;
      text-align: center;
      padding: 100px 0;
    }
    header h1 {
      font-size: 3rem;
      margin-bottom: 20px;
    }
    header .lead {
      font-size: 1.5rem;
      margin-bottom: 30px;
      max-width: 700px;
      margin-left: auto;
      margin-right: auto;
    }
    .cta {
      display: inline-block;
      background-color: #ff6b6b;
      color: white;
      padding: 12px 30px;
      border: none;
      border-radius: 30px;
      font-size: 1.1rem;
      cursor: pointer;
      transition: all 0.3s ease;
    }
    .cta:hover {
      background-color: #ff5252;
      transform: translateY(-3px);
      box-shadow: 0 10px 20px rgba(0, 0, 0, 0.1);
    }
    section {
      padding: 80px 0;
    }
    .features {
      background-color: #f9f9f9;
    }
    .feature-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 30px;
      margin-top: 50px;
    }
    .feature {
      background-color: white;
      padding: 30px;
      border-radius: 10px;
      box-shadow: 0 5px 15px rgba(0, 0, 0, 0.05);
      transition: transform 0.3s ease;
    }
    .feature:hover {
      transform: translateY(-10px);
    }
    .feature h3 {
      margin-bottom: 15px;
      color: #6e8efb;
    }
    .signup {
      background-color: #a777e3;
      color: white;
      text-align: center;
    }
    form {
      max-width: 500px;
      margin: 30px auto 0;
      display: flex;
    }
    input[type="email"] {
      flex: 1;
      padding: 15px;
      border: none;
      border-radius: 30px 0 0 30px;
      font-size: 1rem;
    }
    form button {
      background-color: #ff6b6b;
      color: white;
      border: none;
      padding: 0 30px;
      border-radius: 0 30px 30px 0;
      cursor: pointer;
      transition: background-color 0.3s ease;
    }
    form button:hover {
      background-color: #ff5252;
    }
    footer {
      background-color: #333;
      color: white;
      text-align: center;
      padding: 30px 0;
    }
    @media (max-width: 768px) {
      header {
        padding: 70px 0;
      }
      header h1 {
        font-size: 2.5rem;
      }
      header .lead {
        font-size: 1.2rem;
      }
      section {
        padding: 60px 0;
      }
      form {
        flex-direction: column;
      }
      input[type="email"] {
        border-radius: 30px;
        margin-bottom: 10px;
      }
      form button {
        border-radius: 30px;
        padding: 15px 30px;
      }
    }
  </style>
</head>
<body>
  <header>
    <div class="container">
      <h1>{{name}}</h1>
      <p class="lead">{{description}}</p>
      <button class="cta">Sign Up Now</button>
    </div>
  </header>
  
  <section class="features">
    <div class="container">
      <h2>About {{name}}</h2>
      <p>{{description}} - {{purpose}}</p>
      
      <div class="feature-grid">
        <div class="feature">
          <h3>Feature 1</h3>
          <p>Description of feature 1</p>
        </div>
        <div class="feature">
          <h3>Feature 2</h3>
          <p>Description of feature 2</p>
        </div>
        <div class="feature">
          <h3>Feature 3</h3>
          <p>Description of feature 3</p>
        </div>
      </div>
    </div>
  </section>
  
  <section class="signup">
    <div class="container">
      <h2>Get Early Access</h2>
      <p>Be among the first to experience {{name}}.</p>
      <form id="signup-form">
        <input type="email" placeholder="Enter your email" required>
        <button type="submit">Sign Up</button>
      </form>
    </div>
  </section>
  
  <footer>
    <div class="container">
      <p>&copy; 2025 {{name}}. All rights reserved.</p>
    </div>
  </footer>
  
  <script>
    document.addEventListener('DOMContentLoaded', function() {
      const form = document.getElementById('signup-form');
      
      form.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const email = form.querySelector('input[type="email"]').value;
        
        if (validateEmail(email)) {
          alert('Thank you for signing up! We will be in touch soon.');
          form.reset();
        } else {
          alert('Please enter a valid email address.');
        }
      });
      
      function validateEmail(email) {
        const re = /^(([^<>()\\[\\]\\\\.,;:\\s@"]+(\\.[^<>()\\[\\]\\\\.,;:\\s@"]+)*)|(".+"))@((\\[[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}\\])|(([a-zA-Z\\-0-9]+\\.)+[a-zA-Z]{2,}))$/;
        return re.test(String(email).toLowerCase());
      }
    });
  </script>
</body>
</html>`;
  }

  /**
   * Retry a function with exponential backoff
   * 
   * @param {Function} fn - Function to retry
   * @param {number} retries - Number of retries left
   * @returns {Promise<any>} - Result of the function
   */
  async withRetry(fn, retries = this.maxRetries) {
    try {
      return await fn();
    } catch (error) {
      if (retries <= 0) throw error;
      
      console.log(`Retrying... (${retries} attempts left)`);
      await new Promise(res => setTimeout(res, this.retryDelay));
      
      // Increase delay for next retry (exponential backoff)
      this.retryDelay *= 1.5;
      
      return this.withRetry(fn, retries - 1);
    }
  }
}

export default GeminiService;
