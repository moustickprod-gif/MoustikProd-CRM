import Stripe from 'stripe';

export default async function handler(req, res) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: 'STRIPE_SECRET_KEY manquante dans les variables Vercel' });
  }
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  try {
    const {
      factureId,
      factureNumero,
      montantTTC,
      clientEmail,
      clientNom,
      description,
      userId,
    } = req.body;

    if (!montantTTC || montantTTC <= 0) {
      return res.status(400).json({ error: 'Montant invalide' });
    }

    const montantCentimes = Math.round(montantTTC * 100);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      customer_email: clientEmail || undefined,
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: description || `Facture ${factureNumero}`,
              description: `Moustikprod — ${factureNumero}`,
            },
            unit_amount: montantCentimes,
          },
          quantity: 1,
        },
      ],
      metadata: {
        factureId: factureId || '',
        factureNumero: factureNumero || '',
        clientNom: clientNom || '',
        userId: userId || '',
      },
      success_url: `https://moustikprod-crm.vercel.app?paiement=success&facture=${encodeURIComponent(factureNumero || '')}`,
      cancel_url:  `https://moustikprod-crm.vercel.app?paiement=cancel&facture=${encodeURIComponent(factureNumero || '')}`,
    });

    return res.status(200).json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('[stripe-checkout] Erreur:', err);
    return res.status(500).json({ error: err.message });
  }
}
