import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const projectId = 'moustikprod-crm';
const firestoreBase = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

// ── Firestore REST helpers ────────────────────────────────────────────────────
async function fsGetRaw(path) {
  const r = await fetch(`${firestoreBase}/${path}`);
  if (!r.ok) return null;
  return r.json();
}

async function fsGet(path) {
  const raw = await fsGetRaw(path);
  if (!raw) return null;
  return parseFs(raw.fields || {});
}

async function fsSet(path, data) {
  const r = await fetch(`${firestoreBase}/${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: toFs(data) }),
  });
  return r.ok;
}

// Patch uniquement certains champs (sans écraser tout le document)
async function fsPatch(path, data, fieldPaths) {
  const mask = fieldPaths.map(f => `updateMask.fieldPaths=${encodeURIComponent(f)}`).join('&');
  const r = await fetch(`${firestoreBase}/${path}?${mask}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: toFs(data) }),
  });
  return r.ok;
}

function parseFs(fields) {
  const parse = v => {
    if (v.stringValue  !== undefined) return v.stringValue;
    if (v.booleanValue !== undefined) return v.booleanValue;
    if (v.integerValue !== undefined) return Number(v.integerValue);
    if (v.doubleValue  !== undefined) return v.doubleValue;
    if (v.nullValue    !== undefined) return null;
    if (v.mapValue)   return Object.fromEntries(Object.entries(v.mapValue.fields   || {}).map(([k, val]) => [k, parse(val)]));
    if (v.arrayValue) return (v.arrayValue.values || []).map(parse);
    return null;
  };
  return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, parse(v)]));
}

function toFs(obj) {
  const convert = v => {
    if (v === null || v === undefined) return { nullValue: null };
    if (typeof v === 'boolean') return { booleanValue: v };
    if (typeof v === 'number')  return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    if (typeof v === 'string')  return { stringValue: v };
    if (Array.isArray(v))       return { arrayValue: { values: v.map(convert) } };
    if (typeof v === 'object')  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, val]) => [k, convert(val)])) } };
    return { stringValue: String(v) };
  };
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, convert(v)]));
}

// ── Calculs facture (identiques au CRM) ──────────────────────────────────────
function totalHT(doc) {
  return (doc.lignes || []).reduce((s, l) => s + (l.quantite || 0) * (l.prixUnitaire || 0) * (1 - (l.remise || 0) / 100), 0);
}
function totalTVA(doc) {
  if (doc.regimeTVA === 'franchise') return 0;
  return (doc.lignes || []).reduce((s, l) => s + (l.quantite || 0) * (l.prixUnitaire || 0) * (1 - (l.remise || 0) / 100) * ((l.tva || 0) / 100), 0);
}
function totalApresRemise(doc) {
  return (totalHT(doc) + totalTVA(doc)) * (1 - (doc.remise || 0) / 100);
}
function fmtMoney(n) {
  return (n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}
function fmtDate(str) {
  if (!str) return '—';
  return new Date(str).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}
function today() {
  return new Date().toISOString().slice(0, 10);
}
function uid() {
  return 'f_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
function nextNumFacture(factures) {
  const yr = new Date().getFullYear();
  const nums = factures.map(f => parseInt((f.numero || '').split('-')[2] || '0')).filter(n => !isNaN(n));
  const next = nums.length ? Math.max(...nums) + 1 : 1;
  return `F-${yr}-${String(next).padStart(3, '0')}`;
}

// ── Email Brevo ───────────────────────────────────────────────────────────────
async function sendEmail(to, subject, htmlContent) {
  if (!process.env.BREVO_API_KEY) return;
  const cleanSubject = subject.replace(/[\u{1F300}-\u{1FFFF}]/gu, '').trim();
  const r = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'accept': 'application/json', 'api-key': process.env.BREVO_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({
      sender: { name: 'Moustikprod', email: 'contact@moustikprod.fr' },
      to: [{ email: to }],
      subject: cleanSubject,
      htmlContent,
    }),
  });
  const data = await r.json();
  console.log('[webhook] Email envoyé à', to, '— status:', r.status, data.messageId || data.message || '');
}

// ── Génère et envoie la facture acquittée par email ───────────────────────────
async function envoyerFactureAcquittee(facture, crmData) {
  const { clients = [], projets = [], settings: s = {} } = crmData;
  const client = clients.find(c => c.id === facture.clientId) || {};
  if (!client.email) { console.log('[webhook] Pas email client pour facture', facture.numero); return; }

  const projet = projets.find(p => p.id === facture.projetId) || {};
  const ht  = totalHT(facture);
  const tva = totalTVA(facture);
  const ttc = totalApresRemise(facture);
  const franchise = (facture.regimeTVA || s.regimeTVA || 'franchise') === 'franchise';
  const nomCommercial = s.nomCommercial || 'Moustikprod';
  const siret = s.siret || '89033460000040';
  const emailContact = s.email || 'contact@moustikprod.fr';
  const iban = s.iban || '';

  // Sauvegarde HTML de la facture pour lien de téléchargement
  const token = 'fv_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const htmlFacture = genererHtmlFacture(facture, client, projet, s);
  await fsSet(`signatureRequests/${token}`, {
    type: 'facture_view',
    htmlContent: htmlFacture,
    factureNumero: facture.numero || '',
    clientNom: client.nom || '',
    createdAt: new Date().toISOString(),
  });
  const lienFacture = `https://moustikprod-crm.vercel.app/sign.html?token=${token}`;

  const typeFacture = facture.typeFacture || 'standard';
  const typeBannieres = {
    mensuelle: { couleur: '#635bff', fond: '#f5f4ff', bordure: '#635bff', emoji: '📅', label: 'MENSUALITÉ ABONNEMENT' },
    acompte:   { couleur: '#b45309', fond: '#fffbeb', bordure: '#f59e0b', emoji: '📑', label: "FACTURE D'ACOMPTE" },
    solde:     { couleur: '#15803d', fond: '#f0fdf4', bordure: '#22c55e', emoji: '✅', label: 'FACTURE DE SOLDE' },
  };
  const tb = typeBannieres[typeFacture];
  const banniereHtml = tb ? `
    <div style="background:${tb.fond};border:2px solid ${tb.bordure};border-radius:10px;padding:14px 18px;margin:16px 0;text-align:center">
      <div style="font-size:16px;font-weight:900;text-transform:uppercase;color:${tb.couleur}">${tb.emoji} ${tb.label}</div>
    </div>` : '';

  const html = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;border:1px solid #eee;border-radius:8px;overflow:hidden">
    <div style="background:#024059;padding:24px;text-align:center">
      <div style="font-size:24px;font-weight:900;color:#3CD6D1;letter-spacing:-0.5px">Moustik<span style="color:#fff">Prod</span></div>
      <div style="font-size:12px;color:rgba(255,255,255,0.6);margin-top:4px;letter-spacing:1px;text-transform:uppercase">Studio de production vidéo</div>
    </div>
    <div style="padding:30px">
      <p>Bonjour ${client.nom || ''},</p>
      <p style="color:#16a34a;font-weight:bold;font-size:16px">Votre paiement a bien été reçu. Merci !</p>
      ${banniereHtml}
      <div style="background:#f8f9fa;border-radius:8px;padding:16px;margin:20px 0">
        <p style="font-weight:bold;margin-bottom:8px">Détails :</p>
        <ul style="margin:0;padding-left:18px;line-height:2.2">
          <li>N° de facture : <strong>${facture.numero}</strong></li>
          <li>Montant HT : <strong>${fmtMoney(ht)}</strong></li>
          ${!franchise ? `<li>TVA : <strong>${fmtMoney(tva)}</strong></li><li>Total TTC : <strong>${fmtMoney(ttc)}</strong></li>` : `<li>Total : <strong>${fmtMoney(ttc)}</strong></li>`}
          <li>Date d'émission : ${fmtDate(facture.date)}</li>
          <li>Date de paiement : <strong style="color:#16a34a">${fmtDate(facture.datePaiement || today())}</strong></li>
        </ul>
      </div>
      <div style="text-align:center;margin:24px 0">
        <a href="${lienFacture}" style="background:#22c55e;color:#fff;font-weight:bold;padding:14px 28px;border-radius:8px;text-decoration:none;font-size:15px;display:inline-block">Telecharger la facture acquittee</a>
        <p style="font-size:11px;color:#aaa;margin-top:8px">Lien valable 90 jours</p>
      </div>
      ${franchise ? '<p style="font-size:12px;color:#666">TVA non applicable, art. 293 B du CGI et 223-21 du CIBS</p>' : ''}
      <p>Cordialement,<br><strong>${s.prenom || 'Romain'} ${s.nom || 'ANDRE'} — ${nomCommercial}</strong></p>
    </div>
    <div style="background:#f5f5f5;padding:15px;text-align:center;font-size:11px;color:#999">
      ${nomCommercial} — SIRET ${siret} — ${emailContact}
    </div>
  </div>`;

  await sendEmail(client.email, `Facture acquittee ${facture.numero} — ${nomCommercial}`, html);
}

// ── HTML complet de la facture (pour le lien de téléchargement) ───────────────
function genererHtmlFacture(facture, client, projet, s) {
  const ht  = totalHT(facture);
  const tva = totalTVA(facture);
  const ttc = totalApresRemise(facture);
  const franchise = (facture.regimeTVA || s.regimeTVA || 'franchise') === 'franchise';

  const lignesHtml = (facture.lignes || []).map(l => {
    const montant = (l.quantite || 0) * (l.prixUnitaire || 0) * (1 - (l.remise || 0) / 100);
    return `<tr>
      <td style="padding:10px 16px;border-bottom:1px solid #f0f0f0">${l.description || ''}</td>
      <td style="padding:10px;text-align:center;border-bottom:1px solid #f0f0f0">${l.quantite || 0}</td>
      <td style="padding:10px;text-align:right;border-bottom:1px solid #f0f0f0">${fmtMoney(l.prixUnitaire || 0)}</td>
      <td style="padding:10px;text-align:center;border-bottom:1px solid #f0f0f0;color:${(l.remise || 0) > 0 ? '#dc2626' : '#999'}">${(l.remise || 0) > 0 ? '-' + l.remise + '%' : '—'}</td>
      <td style="padding:10px;text-align:center;border-bottom:1px solid #f0f0f0">${(l.tva || 0) > 0 ? l.tva + '%' : '0%'}</td>
      <td style="padding:10px;text-align:right;font-weight:600;border-bottom:1px solid #f0f0f0">${fmtMoney(montant)}</td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Facture ${facture.numero}</title></head>
  <body style="font-family:sans-serif;color:#1a2b3c;background:#fff;max-width:800px;margin:0 auto;padding:24px">
    <div style="background:#024059;padding:24px;border-radius:8px 8px 0 0;display:flex;justify-content:space-between;align-items:center">
      <div>
        <div style="font-size:22px;font-weight:900;color:#3CD6D1">Moustik<span style="color:#fff">Prod</span></div>
        <div style="font-size:11px;color:rgba(255,255,255,0.6);letter-spacing:1px;text-transform:uppercase">Studio de production vidéo</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:20px;font-weight:900;color:#22c55e">FACTURE — ACQUITTÉE</div>
        <div style="color:#3CD6D1;font-weight:600;font-size:16px">${facture.numero}</div>
        <div style="color:rgba(255,255,255,0.6);font-size:12px">Date : ${fmtDate(facture.date)}</div>
      </div>
    </div>
    <div style="border:1px solid #eee;padding:24px">
      <div style="display:flex;justify-content:space-between;margin-bottom:24px">
        <div>
          <p style="font-size:11px;color:#999;text-transform:uppercase;margin-bottom:4px">Émetteur</p>
          <p style="font-weight:bold;margin:0">${s.nomCommercial || 'Moustikprod'}</p>
          ${s.adresse ? `<p style="color:#666;font-size:13px;margin:2px 0">${s.adresse}</p>` : ''}
          ${(s.codePostal || s.ville) ? `<p style="color:#666;font-size:13px;margin:2px 0">${[s.codePostal, s.ville].filter(Boolean).join(' ')}</p>` : ''}
          <p style="color:#666;font-size:13px;margin:2px 0">SIRET : ${s.siret || '89033460000040'}</p>
          ${s.tvaIntra ? `<p style="color:#666;font-size:13px;margin:2px 0">N° TVA : ${s.tvaIntra}</p>` : ''}
        </div>
        <div style="text-align:right">
          <p style="font-size:11px;color:#999;text-transform:uppercase;margin-bottom:4px">Client</p>
          <p style="font-weight:bold;margin:0">${client.nom || ''}</p>
          ${client.entreprise ? `<p style="color:#666;font-size:13px;margin:2px 0">${client.entreprise}</p>` : ''}
          ${client.adresse ? `<p style="color:#666;font-size:13px;margin:2px 0">${client.adresse}</p>` : ''}
          ${(client.codePostal || client.ville) ? `<p style="color:#666;font-size:13px;margin:2px 0">${[client.codePostal, client.ville].filter(Boolean).join(' ')}</p>` : ''}
        </div>
      </div>
      <table style="width:100%;border-collapse:collapse;margin:20px 0">
        <thead>
          <tr style="background:#f5f5f5">
            <th style="padding:10px 16px;text-align:left;font-size:12px;color:#666">Description</th>
            <th style="padding:10px;text-align:center;font-size:12px;color:#666">Qté</th>
            <th style="padding:10px;text-align:right;font-size:12px;color:#666">Prix unit. HT</th>
            <th style="padding:10px;text-align:center;font-size:12px;color:#666">Remise</th>
            <th style="padding:10px;text-align:center;font-size:12px;color:#666">TVA</th>
            <th style="padding:10px;text-align:right;font-size:12px;color:#666">Total HT</th>
          </tr>
        </thead>
        <tbody>${lignesHtml}</tbody>
      </table>
      <div style="max-width:280px;margin-left:auto">
        <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:14px">
          <span style="color:#666">Total HT</span><span style="font-weight:600">${fmtMoney(ht)}</span>
        </div>
        ${(facture.remise || 0) > 0 ? `<div style="display:flex;justify-content:space-between;padding:6px 0;font-size:14px;color:#16a34a">
          <span>Remise (${facture.remise}%)</span><span>− ${fmtMoney(ht * (facture.remise / 100))}</span>
        </div>` : ''}
        ${!franchise ? `<div style="display:flex;justify-content:space-between;padding:6px 0;font-size:14px">
          <span style="color:#666">TVA</span><span style="font-weight:600">${fmtMoney(tva)}</span>
        </div>` : ''}
        <div style="display:flex;justify-content:space-between;padding:10px 0;font-size:16px;font-weight:900;border-top:2px solid #024059;margin-top:4px">
          <span style="color:#024059">${franchise ? 'Total (TVA non applicable)' : 'Total TTC'}</span>
          <span style="color:#22c55e">${fmtMoney(ttc)}</span>
        </div>
      </div>
      ${franchise ? '<p style="font-size:11px;color:#888;margin-top:16px">TVA non applicable, art. 293 B du CGI et 223-21 du CIBS</p>' : ''}
      ${s.iban ? `<div style="background:#f0fdf4;border-radius:6px;padding:12px;margin-top:16px;border-left:3px solid #22c55e">
        <p style="font-weight:bold;font-size:13px;margin:0 0 4px">Règlement reçu — Merci !</p>
        <p style="font-size:12px;margin:0;color:#666">IBAN : ${s.iban} — Réf : ${facture.numero}</p>
      </div>` : ''}
    </div>
    <p style="text-align:center;font-size:11px;color:#aaa;margin-top:12px">${s.nomCommercial || 'Moustikprod'} — SIRET ${s.siret || '89033460000040'} — ${s.email || 'contact@moustikprod.fr'}</p>
  </body></html>`;
}

// ── Écrit directement dans users/{userId}/data/main ───────────────────────────
async function updateCrmDirectement(userId, updateFn) {
  const raw = await fsGetRaw(`users/${userId}/data/main`);
  if (!raw) { console.log('[webhook] Document CRM introuvable pour', userId); return null; }

  const crmData = parseFs(raw.fields || {});
  const updated = updateFn(crmData);
  if (!updated) return null;

  await fsSet(`users/${userId}/data/main`, { ...crmData, ...updated, _updated: new Date().toISOString() });
  return { ...crmData, ...updated };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const sig = req.headers['stripe-signature'];
  let event;
  try {
    const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    event = webhookSecret
      ? stripe.webhooks.constructEvent(rawBody, sig, webhookSecret)
      : (typeof req.body === 'object' ? req.body : JSON.parse(rawBody));
  } catch (err) {
    console.error('[stripe-webhook] Signature invalide:', err.message);
    return res.status(400).json({ error: 'Webhook signature invalide' });
  }

  console.log('[stripe-webhook] Événement:', event.type);

  // ── Paiement one-shot (Checkout) ──────────────────────────────────────────
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const factureId     = session.metadata?.factureId;
    const factureNumero = session.metadata?.factureNumero;
    const userId        = session.metadata?.userId || '';

    console.log(`[stripe-webhook] One-shot — ${factureNumero} — userId: ${userId}`);

    if (factureId && userId) {
      // Mise à jour directe dans Firestore — pas de pendingFactures
      const crmData = await updateCrmDirectement(userId, (data) => {
        const factures = data.factures || [];
        const idx = factures.findIndex(f => f.id === factureId);
        if (idx === -1 || factures[idx].statut === 'payee') return null;

        factures[idx] = {
          ...factures[idx],
          statut: 'payee',
          datePaiement: today(),
          stripeSessionId: session.id,
          emailEnvoye: true,
        };
        return { factures };
      });

      if (crmData) {
        const facture = crmData.factures.find(f => f.id === factureId);
        if (facture) {
          await envoyerFactureAcquittee(facture, crmData);
          // Notifier Romain
          await sendEmail(
            'contact@moustikprod.fr',
            `Paiement recu — ${factureNumero}`,
            `<p>La facture <strong>${factureNumero}</strong> a été payée via Stripe et marquée automatiquement comme acquittée. La facture acquittée a été envoyée au client.</p>`
          );
          console.log(`[stripe-webhook] Facture ${factureNumero} marquée payée et email envoyé`);
        }
      }
    }
  }

  // ── Abonnement mensuel (invoice) ───────────────────────────────────────────
  if (event.type === 'invoice.payment_succeeded') {
    const invoice = event.data.object;
    const subscriptionId = invoice.subscription;
    if (!subscriptionId) return res.status(200).json({ ok: true, skipped: 'no subscription' });

    const mapping = await fsGet(`stripeSubscriptions/${subscriptionId}`);
    if (!mapping) {
      console.log('[stripe-webhook] Aucun mapping pour', subscriptionId);
      return res.status(200).json({ ok: true, skipped: 'no mapping' });
    }

    const {
      userId, devisId, devisNumero, clientId, clientEmail, clientNom,
      projetId, montantMensuel, nombreMois, regimeTVA, description,
      moisPaies: moisPaiesActuel = 0,
    } = mapping;

    const moisPaies = (moisPaiesActuel || 0) + 1;
    const echeance = new Date(); echeance.setDate(echeance.getDate() + 30);

    // Créer la facture directement dans le CRM
    const crmData = await updateCrmDirectement(userId, (data) => {
      const factures = data.factures || [];
      const numero = nextNumFacture(factures);
      const nouvelleFacture = {
        id: uid(),
        docType: 'facture',
        typeFacture: 'mensuelle',
        numero,
        date: today(),
        echeance: echeance.toISOString().slice(0, 10),
        statut: 'payee',
        datePaiement: today(),
        clientId,
        projetId: projetId || '',
        devisOrigineId: devisId || '',
        devisOrigineNumero: devisNumero || '',
        regimeTVA: regimeTVA || 'franchise',
        lignes: [{ description: description || `Mensualité ${moisPaies}/${nombreMois || 1}`, quantite: 1, prixUnitaire: montantMensuel || 0, remise: 0, tva: 0 }],
        remise: 0,
        stripeInvoiceId: invoice.id,
        stripeSubscriptionId: subscriptionId,
        emailEnvoye: true,
        createdAt: new Date().toISOString(),
      };
      return { factures: [...factures, nouvelleFacture] };
    });

    // Mettre à jour moisPaies dans le mapping
    await fsSet(`stripeSubscriptions/${subscriptionId}`, { ...mapping, moisPaies });

    if (crmData) {
      const factures = crmData.factures || [];
      const nouvelleFacture = factures[factures.length - 1];
      if (nouvelleFacture) {
        await envoyerFactureAcquittee(nouvelleFacture, crmData);
        await sendEmail(
          'contact@moustikprod.fr',
          `Prelevement Stripe — ${clientNom || 'Client'} — mensualite ${moisPaies}/${nombreMois || 1}`,
          `<p>Mensualité <strong>${moisPaies}/${nombreMois || 1}</strong> de <strong>${clientNom}</strong> prélevée (${(montantMensuel || 0).toLocaleString('fr-FR')} €).<br>
          Facture <strong>${nouvelleFacture.numero}</strong> créée automatiquement dans le CRM et envoyée au client.</p>`
        );
        console.log(`[stripe-webhook] Facture mensuelle ${nouvelleFacture.numero} créée et email envoyé`);
      }
    }
  }

  res.status(200).json({ received: true });
}
