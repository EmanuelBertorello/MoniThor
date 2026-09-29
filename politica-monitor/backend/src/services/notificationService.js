const nodemailer = require('nodemailer');
const logger = require('../lib/logger');
const { getDb } = require('../lib/firebase');
const { generateId, toDocs } = require('../lib/db');

let transporter = null;

function getTransporter() {
  if (!transporter && process.env.SMTP_HOST) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_PORT === '465',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return transporter;
}

async function sendEmailAlert({ to, subject, campaign, mentionsCount, sentiment, topMentions }) {
  const t = getTransporter();
  if (!t) {
    logger.warn('Email not configured. Skipping email alert.');
    return false;
  }

  const sentimentColors = {
    NEGATIVE: '#ef4444',
    POSITIVE: '#10b981',
    NEUTRAL: '#64748b',
  };

  const topMentionsHtml = (topMentions || []).slice(0, 3).map(m => `
    <div style="background:#f8f9fa;border-left:4px solid ${sentimentColors[m.sentiment]};padding:12px;margin:8px 0;border-radius:0 8px 8px 0">
      <p style="margin:0;font-size:14px;color:#1e293b">${m.content.slice(0, 200)}...</p>
      <p style="margin:4px 0 0;font-size:12px;color:#64748b">${m.source} · ${m.sourceName || ''}</p>
    </div>
  `).join('');

  const html = `
    <!DOCTYPE html>
    <html>
    <body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f1f5f9;padding:20px">
      <div style="background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.1)">
        <div style="background:linear-gradient(135deg,#1e3a5f,#1d4ed8);padding:24px;text-align:center">
          <h1 style="color:white;margin:0;font-size:22px">PoliticaMonitor</h1>
          <p style="color:#93c5fd;margin:4px 0 0">Alerta de campaña</p>
        </div>
        <div style="padding:24px">
          <div style="background:#fef2f2;border:1px solid #fee2e2;border-radius:8px;padding:16px;margin-bottom:20px">
            <h2 style="color:#dc2626;margin:0 0 8px;font-size:18px">${subject}</h2>
            <p style="color:#7f1d1d;margin:0;font-size:14px">Campaña: <strong>${campaign}</strong></p>
          </div>
          <div style="display:flex;gap:16px;margin-bottom:20px">
            <div style="flex:1;background:#eff6ff;border-radius:8px;padding:16px;text-align:center">
              <p style="font-size:32px;font-weight:bold;color:#1d4ed8;margin:0">${mentionsCount}</p>
              <p style="font-size:12px;color:#64748b;margin:4px 0 0">Menciones detectadas</p>
            </div>
          </div>
          ${topMentionsHtml ? `<h3 style="color:#1e293b;font-size:14px;margin:0 0 8px">Menciones más relevantes:</h3>${topMentionsHtml}` : ''}
          <div style="text-align:center;margin-top:24px">
            <a href="${process.env.FRONTEND_URL}/dashboard" style="background:#1d4ed8;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">
              Ver en Dashboard
            </a>
          </div>
        </div>
        <div style="background:#f8fafc;padding:16px;text-align:center;border-top:1px solid #e2e8f0">
          <p style="font-size:12px;color:#94a3b8;margin:0">PoliticaMonitor - Sistema de monitoreo político</p>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    await t.sendMail({
      from: `"PoliticaMonitor" <${process.env.EMAIL_FROM || process.env.SMTP_USER}>`,
      to: Array.isArray(to) ? to.join(',') : to,
      subject: `Alerta: ${subject}`,
      html,
    });
    logger.info(`Email alert sent to ${to}`);
    return true;
  } catch (err) {
    logger.error(`Email send failed: ${err.message}`);
    return false;
  }
}

async function sendWhatsAppAlert({ to, message }) {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    logger.warn('Twilio not configured. Skipping WhatsApp alert.');
    return false;
  }

  try {
    const twilio = require('twilio')(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );

    const phones = Array.isArray(to) ? to : [to];

    for (const phone of phones) {
      await twilio.messages.create({
        from: process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886',
        to: `whatsapp:${phone}`,
        body: message,
      });
    }

    logger.info(`WhatsApp alert sent to ${phones.join(', ')}`);
    return true;
  } catch (err) {
    logger.error(`WhatsApp send failed: ${err.message}`);
    return false;
  }
}

async function checkAlertRules(campaignId, newMentions, io) {
  const db = getDb();

  const rulesSnap = await db.collection('alertRules')
    .where('campaignId', '==', campaignId)
    .where('isActive', '==', true).get();

  for (const ruleDoc of rulesSnap.docs) {
    const rule = { id: ruleDoc.id, ...ruleDoc.data() };

    try {
      const campDoc = await db.collection('campaigns').doc(rule.campaignId).get();
      if (!campDoc.exists) continue;
      const campaign = campDoc.data();

      const condition = JSON.parse(rule.condition);

      let triggered = false;
      let alertMessage = '';

      if (condition.type === 'mention_spike') {
        const since = new Date(Date.now() - (condition.minutes || 15) * 60 * 1000);
        const countSnap = await db.collection('mentions')
          .where('campaignId', '==', campaignId)
          .where('publishedAt', '>=', since)
          .count().get();
        const count = countSnap.data().count;

        if (count >= (condition.threshold || 50)) {
          triggered = true;
          alertMessage = `Pico de menciones: ${count} menciones en ${condition.minutes || 15} minutos`;
        }
      }

      if (condition.type === 'negative_surge') {
        const negCount = newMentions.filter(m => m.sentiment === 'NEGATIVE').length;
        if (negCount >= (condition.threshold || 5)) {
          triggered = true;
          alertMessage = `Aumento de menciones negativas: ${negCount} nuevas menciones negativas detectadas`;
        }
      }

      if (condition.type === 'keyword_mention' && condition.keyword) {
        const matched = newMentions.filter(m =>
          m.content.toLowerCase().includes(condition.keyword.toLowerCase())
        );
        if (matched.length > 0) {
          triggered = true;
          alertMessage = `Keyword detectada: "${condition.keyword}" mencionada ${matched.length} veces`;
        }
      }

      if (triggered) {
        const alertId = generateId();
        await db.collection('alerts').doc(alertId).set({
          ruleId: rule.id,
          userId: campaign.userId,
          message: alertMessage,
          channel: rule.channels[0] || 'email',
          isRead: false,
          sentAt: new Date(),
        });

        if (io) {
          io.to(`campaign:${campaignId}`).emit('alert', {
            type: 'ALERT_TRIGGERED',
            rule: rule.name,
            message: alertMessage,
            campaignId,
          });
        }

        const topMentions = newMentions.filter(m => m.sentiment === 'NEGATIVE').slice(0, 3);

        if (rule.channels.includes('email') && rule.recipients.length > 0) {
          await sendEmailAlert({
            to: rule.recipients,
            subject: rule.name,
            campaign: campaign.name,
            mentionsCount: newMentions.length,
            sentiment: 'NEGATIVE',
            topMentions,
          });
        }

        if (rule.channels.includes('whatsapp') && rule.recipients.length > 0) {
          await sendWhatsAppAlert({
            to: rule.recipients,
            message: `PoliticaMonitor ALERTA\n\n${rule.name}\n\n${alertMessage}\n\nCampaña: ${campaign.name}\n\nVer dashboard: ${process.env.FRONTEND_URL}`,
          });
        }

        logger.info(`Alert triggered: "${rule.name}" for campaign ${campaignId}`);
      }
    } catch (err) {
      logger.error(`Error processing alert rule ${rule.id}: ${err.message}`);
    }
  }
}

module.exports = { sendEmailAlert, sendWhatsAppAlert, checkAlertRules };
