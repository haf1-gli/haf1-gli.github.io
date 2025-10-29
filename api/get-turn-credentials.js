// It is the *only* place can safely use API key.
// if youre reading, this, why?

export default async function handler(request, response) {
  const apiKey = process.env.METERED_API_KEY;

  if (!apiKey) {
    // i am troubled
    return response.status(500).json({ error: "API key not configured on server" });
  }

  try {
    // Call the Metered API from the server, using key
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
