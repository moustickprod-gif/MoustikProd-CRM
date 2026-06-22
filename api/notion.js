export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { token, payload } = req.body;

  if (!token) return res.status(400).json({ error: 'Token manquant' });

  // Nettoyer le token — supprimer tout caractère non-ASCII
  const cleanToken = token.toString().trim().replace(/[^\x20-\x7E]/g, '');

  if (!cleanToken || cleanToken.length < 10) {
    return res.status(400).json({ error: 'Token Notion invalide — reconfigure-le dans les Paramètres' });
  }

  try {
    const response = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cleanToken}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    console.log('[Notion] Status:', response.status, JSON.stringify(data).slice(0, 200));
    res.status(response.status).json(data);
  } catch (err) {
    console.error('[Notion] Erreur fetch:', err.message);
    res.status(500).json({ error: err.message });
  }
}
