export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const JSONBIN_URL = `https://api.jsonbin.io/v3/b/${process.env.JSONBIN_BIN_ID}`;
  const headers = {
    'X-Master-Key': process.env.JSONBIN_API_KEY,
    'Content-Type': 'application/json'
  };

  console.log('JSONBin URL:', JSONBIN_URL);

  try {
    switch (req.method) {
      case 'GET':
        console.log('Fetching data from JSONBin...');
        const getResponse = await fetch(JSONBIN_URL + '/latest', { headers });
        
        if (!getResponse.ok) {
          throw new Error(`JSONBin GET failed: ${getResponse.status}`);
        }
        
        const data = await getResponse.json();
        console.log('Data fetched successfully');
        return res.json(data.record || []);

      case 'PUT':
        console.log('Updating data to JSONBin...');
        const putResponse = await fetch(JSONBIN_URL, {
          method: 'PUT',
          headers,
          body: JSON.stringify(req.body)
        });
        
        if (!putResponse.ok) {
          throw new Error(`JSONBin PUT failed: ${putResponse.status}`);
        }
        
        console.log('Data updated successfully');
        return res.json({ success: true });

      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Nasabah API Error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
}
