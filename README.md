
# forge

# Farcaster Landing Page Generator

An AI-powered landing page generator that runs through Farcaster. Users trigger it by mentioning the bot in a cast using a simple format: (landing name, description, purpose). The system automatically generates and deploys a complete landing page, then replies with a live URL.

## Features

- **Farcaster Integration**: Listens for mentions via Neynar API
- **Format Validation**: Validates input format from user casts
- **AI-Powered Generation**: Uses Gemini AI to create complete landing pages
- **Automatic Deployment**: Deploys pages to Netlify
- **Instant Response**: Replies to the user with a live URL

## Architecture

The system consists of several components that work together:

1. **Farcaster Listener**: Monitors Farcaster for mentions using Neynar API
2. **Format Validator**: Ensures user input follows the required format
3. **Gemini AI Integration**: Generates HTML, CSS, and JavaScript for landing pages
4. **Netlify Deployment**: Automatically deploys generated pages
5. **Response System**: Replies to users with the live URL

## Setup

### Prerequisites

- Node.js (v14 or higher)
- Neynar API key
- Gemini AI API key
- Netlify account and API token

### Installation

1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```
3. Create a `.env` file based on `.env.example`:
   ```
   NEYNAR_API_KEY=your_neynar_api_key
   GEMINI_API_KEY=your_gemini_api_key
   NETLIFY_AUTH_TOKEN=your_netlify_auth_token
   NETLIFY_SITE_ID=your_netlify_site_id
   PORT=3000
   ```

### Running the Application

Start the server:
```
npm start
```

For development with auto-restart:
```
npm run dev
```

## Testing

Run all tests:
```
npm test
```

Run end-to-end tests:
```
npm run test:e2e
```

## Usage

1. Set up a Neynar webhook to point to your server's `/webhook/farcaster` endpoint
2. Users mention your bot in a Farcaster cast using the format: `(landing name, description, purpose)`
3. The system validates the format, generates a landing page, deploys it, and replies with the URL

## Configuration

Configuration options are available in `config/app.json`:

- **Neynar**: API endpoint, webhook path, and mention format regex
- **Gemini**: Model settings, temperature, and token limits
- **Netlify**: Deployment folder and site name

## License

ISC
>>>>>>> 952313b6 (Initial commit)
