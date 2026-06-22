export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { to, subject, html } = req.body;

  const apiKey = process.env.BREVO_API_KEY;

  if (!apiKey) {
    console.error('[Brevo] Clé API manquante');
    return res.status(500).json({ error: 'Clé API Brevo manquante' });
  }

  if (!to || !subject || !html) {
    return res.status(400).json({ error: 'Paramètres manquants (to, subject, html)' });
  }

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: 'Moustikprod', email: 'contact@moustikprod.fr' },
        to: [{ email: to }],
        subject: subject.replace(/[\u{1F300}-\u{1FFFF}]/gu, '').trim(), // supprimer emojis du sujet
        htmlContent: html,
        textContent: 'Email de Moustikprod — Studio de production vidéo. Consultez la version HTML pour voir le contenu complet.',
        headers: {
          'X-Mailin-custom': 'moustikprod-crm',
        },
      }),
    });

    const data = await response.json();
    // Log complet sur une ligne pour Vercel CLI
    console.log(JSON.stringify({ status: response.status, to, subject: subject.slice(0, 60), brevo: data }));
    if (!response.ok) {
      console.error('[Brevo] ERREUR ' + response.status + ': ' + JSON.stringify(data));
      return res.status(response.status).json({ error: data.message || JSON.stringify(data) });
    }
    res.status(response.status).json(data);
  } catch (err) {
    console.error('[Brevo] Exception:', err.message);
    res.status(500).json({ error: err.message });
  }
}
