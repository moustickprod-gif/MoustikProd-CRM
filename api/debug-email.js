export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'BREVO_API_KEY manquante dans Vercel' });

  const results = {};

  // 1. Vérifier le compte Brevo
  try {
    const accountRes = await fetch('https://api.brevo.com/v3/account', {
      headers: { 'api-key': apiKey, 'accept': 'application/json' },
    });
    results.account = { status: accountRes.status, data: await accountRes.json() };
  } catch (e) {
    results.account = { error: e.message };
  }

  // 2. Envoyer un email de test si méthode POST
  if (req.method === 'POST') {
    const to = req.body?.to || 'contact@moustikprod.fr';
    try {
      const emailRes = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': apiKey, 'accept': 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify({
          sender: { name: 'Moustikprod', email: 'contact@moustikprod.fr' },
          to: [{ email: to }],
          subject: 'TEST diagnostic CRM Moustikprod',
          htmlContent: '<p>Email de test envoyé depuis le diagnostic CRM.</p>',
          textContent: 'Email de test envoyé depuis le diagnostic CRM.',
        }),
      });
      results.testEmail = { status: emailRes.status, to, data: await emailRes.json() };
    } catch (e) {
      results.testEmail = { error: e.message };
    }
  }

  console.log('DEBUG EMAIL:', JSON.stringify(results));
  res.status(200).json(results);
}
