// This file runs on Vercel's server, no api scraping HAH.
// It is the *only* place that can safely use API key.

export default async function handler(request, response) {
  // 1. Get the secret API key from Vercel's environment
  const apiKey = process.env.METERED_API_KEY;

  if (!apiKey) {
    // This will happen if forgor Step 1(idiot)
    return response.status(500).json({ error: "API key not configured on server" });
  }

  try {
    // 2. Call the real Metered API from the server, using key
    const apiResponse = await fetch(`https://halfiistestingyes.metered.live/api/v1/turn/credentials?apiKey=${apiKey}`);

    if (!apiResponse.ok) {
      throw new Error(`Metered API error: ${apiResponse.statusText}`);
    }

    // 3. Get the *temporary* credentials from Metered
    const temporaryIceServers = await apiResponse.json();

    // 4. Send those *temporary* (and safe) credentials back to funy tank game
    return response.status(200).json(temporaryIceServers);

  } catch (error) {
    console.error(error);
    return response.status(500).json({ error: "Failed to fetch credentials" });
  }
}
