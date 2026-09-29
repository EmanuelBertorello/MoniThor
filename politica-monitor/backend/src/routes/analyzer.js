// src/routes/analyzer.js — Analizador de URL individual
const express = require('express');
const axios   = require('axios');
const logger  = require('../lib/logger');
const { authenticate } = require('../middleware/auth');
const { analyzeSentiment } = require('../services/sentimentService');

const router = express.Router();
router.use(authenticate);

// POST /api/analyzer/analyze
router.post('/analyze', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL requerida' });

    const platform = detectPlatform(url);
    logger.info(`Analyzer: ${platform} → ${url}`);

    let result;
    switch (platform) {
      case 'FACEBOOK':   result = await analyzeFacebook(url); break;
      case 'INSTAGRAM':  result = await analyzeInstagram(url); break;
      case 'TIKTOK':     result = await analyzeTikTok(url); break;
      case 'TWITTER':    result = await analyzeTwitter(url); break;
      case 'YOUTUBE':    result = await analyzeYouTube(url); break;
      default:           result = await analyzeGenericWeb(url);
    }

    result.platform = platform;
    result.sourceUrl = url;

    // Analizar sentimiento del post principal con Gemini
    if (result.postText) {
      const { sentiment, score } = await analyzeSentiment(result.postText);
      result.overallSentiment = sentiment;
      result.sentimentScore   = score;
      result.sentimentAnalysis = buildSentimentExplanation(sentiment, score, result);
    }

    // Analizar sentimiento de cada comentario
    if (result.comments?.length > 0) {
      const breakdown = { POSITIVE: 0, NEGATIVE: 0, NEUTRAL: 0 };
      for (const comment of result.comments) {
        const { sentiment, score } = await analyzeSentiment(comment.text || '');
        comment.sentiment = sentiment;
        comment.score     = score;
        breakdown[sentiment]++;
      }
      result.sentimentBreakdown = breakdown;
    }

    // Calcular engagement rate
    if (result.views && result.views > 0) {
      const interactions = (result.likes||0) + (result.commentsCount||0) + (result.shares||0);
      result.engagementRate = (interactions / result.views) * 100;
    }

    // Top palabras de comentarios
    result.topWords = extractTopWords(result.comments || []);

    // Key topics del post
    result.keyTopics = extractTopics(result.postText || '');

    // Alcance estimado
    result.estimatedReach = estimateReach(result);

    // Nivel de impacto
    result.impactLevel = classifyImpact(result);

    // Resumen ejecutivo con IA
    result.executiveSummary = await buildExecutiveSummary(result);

    res.json(result);
  } catch (err) {
    logger.error(`Analyzer error: ${err.message}`);
    res.status(500).json({ error: 'Error al analizar: ' + err.message });
  }
});

// ─── DETECCIÓN DE PLATAFORMA ──────────────────────────────────────────────────
function detectPlatform(url) {
  const u = url.toLowerCase();
  if (u.includes('facebook.com') || u.includes('fb.com')) return 'FACEBOOK';
  if (u.includes('instagram.com'))  return 'INSTAGRAM';
  if (u.includes('tiktok.com'))     return 'TIKTOK';
  if (u.includes('twitter.com') || u.includes('x.com')) return 'TWITTER';
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'YOUTUBE';
  return 'WEB';
}

// ─── FACEBOOK ─────────────────────────────────────────────────────────────────
async function analyzeFacebook(url) {
  return analyzeFacebookWithPlaywright(url);
}

async function analyzeFacebookWithPlaywright(url) {
  let browser = null;
  try {
    const { chromium } = require('playwright');
    browser = await chromium.launch({ headless:true, args:['--no-sandbox','--disable-setuid-sandbox'] });
    const context = await browser.newContext({
      userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      locale:'es-AR',
    });
    await context.addInitScript(()=>{ Object.defineProperty(navigator,'webdriver',{get:()=>undefined}); });

    const page = await context.newPage();
    await page.route('**/*.{mp4,webm,ogg,mp3,woff,woff2,png,jpg,gif}', r=>r.abort());
    await page.goto(url.replace('www.facebook.com','m.facebook.com'), { waitUntil:'domcontentloaded', timeout:30000 });
    await page.waitForTimeout(3000);

    // Scrollear para cargar comentarios
    for (let i=0; i<5; i++) {
      await page.evaluate(()=>window.scrollBy(0,800));
      await page.waitForTimeout(1000);
    }

    const data = await page.evaluate(()=>{
      const getText = sels => {
        for (const sel of sels) {
          const el = document.querySelector(sel);
          if (el?.innerText?.trim()) return el.innerText.trim();
        }
        return '';
      };

      const postText = getText(['div[data-ft] div[dir="auto"]','div._5rgt','div.story_body_container','article']);
      const author   = getText(['.actor-name','h3._7tae','div._5pb8','.username']);

      const comments = [];
      const seen = new Set();
      document.querySelectorAll('div[data-sigil="comment"],div._2vq7,li._4c7r,div.UFIComment').forEach(el=>{
        const text = el.innerText?.trim().replace(/\s+/g,' ');
        const authorEl = el.querySelector('a._6qw4,.actor-name,a strong');
        const authorName = authorEl?.innerText?.trim() || 'Usuario';
        const likesEl = el.querySelector('[data-sigil="like-count"],.UFILikes');
        const likes = parseInt(likesEl?.innerText?.replace(/[^\d]/g,'')) || 0;
        if (text && text.length > 5 && !seen.has(text)) {
          seen.add(text);
          comments.push({ text: text.slice(0,500), author:authorName, likes });
        }
      });

      // Métricas
      const likesEl = document.querySelector('[data-sigil="like-count"] span, ._4bl9,.like_def');
      const likes = parseInt(likesEl?.innerText?.replace(/[^\d]/g,'')) || 0;
      const sharesEl = document.querySelector('._4bl9._1o_r, ._3hg-');
      const shares = parseInt(sharesEl?.innerText?.replace(/[^\d]/g,'')) || 0;

      return { postText, author, likes, shares, comments: comments.slice(0,100) };
    });

    await browser.close(); browser = null;
    return { ...data, commentsCount: data.comments.length, views: 0 };

  } catch (err) {
    logger.warn(`Facebook Playwright analyzer: ${err.message}`);
    return { postText:'', comments:[], likes:0, shares:0, commentsCount:0, views:0 };
  } finally {
    if (browser) await browser.close().catch(()=>{});
  }
}

// ─── INSTAGRAM ────────────────────────────────────────────────────────────────
async function analyzeInstagram(url) {
  return analyzeInstagramWithPlaywright(url);
}

async function analyzeInstagramWithPlaywright(url) {
  let browser = null;
  try {
    const { chromium } = require('playwright');
    browser = await chromium.launch({ headless:true, args:['--no-sandbox','--disable-setuid-sandbox'] });
    const page = await (await browser.newContext({
      userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      locale:'es-AR',
    })).newPage();
    await page.route('**/*.{mp4,webm,ogg,mp3,woff}', r=>r.abort());
    await page.goto(url, { waitUntil:'networkidle', timeout:30000 });
    await page.waitForTimeout(3000);

    const loginWall = await page.$('input[name="username"]');
    if (loginWall) {
      await browser.close();
      return { postText:'', comments:[], likes:0, shares:0, commentsCount:0, views:0, error:'Instagram requiere login para acceder a este contenido' };
    }

    for (let i=0; i<4; i++) {
      await page.evaluate(()=>window.scrollBy(0,700));
      await page.waitForTimeout(1000);
    }

    const data = await page.evaluate(()=>{
      const caption = document.querySelector('article div span[dir="auto"], div._a9zs span, h1')?.innerText?.trim() || '';
      const author  = document.querySelector('header a,div._aaqt,div._aasi')?.innerText?.trim() || 'Instagram';
      const likes   = parseInt(document.querySelector('div._aacl._aaco._aacu._aacx._aad6._aade, section span')?.innerText?.replace(/[^\d]/g,'')) || 0;

      const comments = [];
      const seen = new Set();
      document.querySelectorAll('article ul li span[dir="auto"], ul._a9z6 li span').forEach(el=>{
        const text = el.innerText?.trim();
        if (text && text.length > 3 && !seen.has(text)) { seen.add(text); comments.push({ text:text.slice(0,300), author:'Usuario IG', likes:0 }); }
      });

      return { postText:caption, author, likes, comments:comments.slice(0,80) };
    });

    await browser.close(); browser = null;
    return { ...data, commentsCount:data.comments.length, shares:0, views:0 };

  } catch (err) {
    logger.warn(`Instagram Playwright: ${err.message}`);
    return { postText:'', comments:[], likes:0, shares:0, commentsCount:0, views:0 };
  } finally {
    if (browser) await browser.close().catch(()=>{});
  }
}

// ─── TIKTOK ───────────────────────────────────────────────────────────────────
async function analyzeTikTok(url) {
  return { postText:'', comments:[], likes:0, shares:0, commentsCount:0, views:0, error:'Análisis de TikTok no disponible' };
}

// ─── TWITTER/X ────────────────────────────────────────────────────────────────
async function analyzeTwitter(url) {
  // Extraer tweet ID
  const tweetId = url.match(/status\/(\d+)/)?.[1];
  if (!tweetId) return { postText:'', comments:[], likes:0, shares:0, views:0 };

  // oEmbed público
  try {
    const oEmbed = await axios.get(`https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}`, { timeout:8000 });
    const html = oEmbed.data?.html || '';
    const text = html.replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim();
    return { postText:text.slice(0,500), author: oEmbed.data?.author_name || 'Twitter', likes:0, commentsCount:0, shares:0, views:0, comments:[] };
  } catch {}

  return { postText:'', comments:[], likes:0, shares:0, commentsCount:0, views:0 };
}

// ─── YOUTUBE ─────────────────────────────────────────────────────────────────
async function analyzeYouTube(url) {
  // Extraer video ID
  const videoId = url.match(/[?&]v=([^&]+)/)?.[1] || url.match(/youtu\.be\/([^?]+)/)?.[1];

  if (process.env.YOUTUBE_API_KEY && videoId) {
    try {
      const [statsRes, commentsRes] = await Promise.all([
        axios.get(`https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet&id=${videoId}&key=${process.env.YOUTUBE_API_KEY}`, { timeout:10000 }),
        axios.get(`https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${videoId}&maxResults=100&key=${process.env.YOUTUBE_API_KEY}`, { timeout:10000 }),
      ]);

      const video = statsRes.data.items?.[0];
      const stats = video?.statistics || {};
      const comments = (commentsRes.data.items || []).map(i=>({
        text:   i.snippet.topLevelComment.snippet.textDisplay,
        author: i.snippet.topLevelComment.snippet.authorDisplayName,
        likes:  i.snippet.topLevelComment.snippet.likeCount || 0,
      }));

      return {
        postText:      video?.snippet?.description?.slice(0,500) || '',
        author:        video?.snippet?.channelTitle || 'YouTube',
        likes:         parseInt(stats.likeCount) || 0,
        commentsCount: parseInt(stats.commentCount) || 0,
        shares:        0,
        views:         parseInt(stats.viewCount) || 0,
        publishedAt:   video?.snippet?.publishedAt || null,
        comments,
      };
    } catch (err) {
      logger.warn(`YouTube API: ${err.message}`);
    }
  }

  // Fallback sin API key: Playwright
  let browser = null;
  try {
    const { chromium } = require('playwright');
    browser = await chromium.launch({ headless:true, args:['--no-sandbox'] });
    const page = await (await browser.newContext({ userAgent:'Mozilla/5.0', locale:'es-AR' })).newPage();
    await page.goto(url, { waitUntil:'networkidle', timeout:30000 });
    await page.waitForTimeout(4000);

    const data = await page.evaluate(()=>{
      const views = document.querySelector('.view-count,#info .style-scope:first-child')?.innerText || '0';
      const likes = document.querySelector('yt-formatted-string[aria-label*="Me gusta"],button[aria-label*="like"] yt-formatted-string')?.innerText || '0';
      const title = document.querySelector('h1.ytd-video-primary-info-renderer,#title h1')?.innerText || '';
      const desc  = document.querySelector('#description-inline-expander,#description yt-formatted-string')?.innerText || '';
      const comments = [];
      document.querySelectorAll('ytd-comment-thread-renderer #content-text').forEach(el=>{
        const t = el.innerText?.trim();
        if (t && t.length > 3) comments.push({ text:t.slice(0,300), author:'Usuario YT', likes:0 });
      });
      return { views:parseInt(views.replace(/[^\d]/g,''))||0, likes:parseInt(likes.replace(/[^\d]/g,''))||0, title, desc:desc.slice(0,400), comments:comments.slice(0,80) };
    });

    await browser.close(); browser = null;
    return { postText:data.title+'. '+data.desc, author:'YouTube', likes:data.likes, views:data.views, commentsCount:data.comments.length, shares:0, comments:data.comments };
  } catch (err) {
    return { postText:'', comments:[], likes:0, shares:0, commentsCount:0, views:0 };
  } finally {
    if (browser) await browser.close().catch(()=>{});
  }
}

// ─── WEB GENÉRICA ────────────────────────────────────────────────────────────
async function analyzeGenericWeb(url) {
  const cheerio = require('cheerio');
  try {
    const res = await axios.get(url, { headers:{ 'User-Agent':'Mozilla/5.0' }, timeout:15000 });
    const $ = cheerio.load(res.data);
    $('nav,script,style,footer,header,aside').remove();
    const title = $('title').text().trim() || $('h1').first().text().trim();
    let content = '';
    for (const sel of ['article','.entry-content','.post-content','main']) {
      const t = $(sel).text().replace(/\s+/g,' ').trim();
      if (t.length > 100) { content = t; break; }
    }
    return { postText:(title+'. '+content).slice(0,600), author:new URL(url).hostname, likes:0, commentsCount:0, shares:0, views:0, comments:[] };
  } catch (err) {
    return { postText:'', comments:[], likes:0, shares:0, commentsCount:0, views:0 };
  }
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function extractTopWords(comments) {
  const STOPWORDS = new Set(['que','de','la','el','en','y','a','los','las','un','una','es','se','del','por','con','para','como','lo','su','al','no','pero','más','este','esta','son','hay','fue','era','me','mi','te','tu','le','nos','si','ya','muy','todo','todos','bien','ser','estar','hacer','ir','ver','poder','querer','saber','decir','cuando','donde','porque','aunque','también','solo','sin','sobre','cada','este','esta','estos','estas']);
  const counts = {};
  for (const c of comments) {
    (c.text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z\s]/g,' ').split(/\s+/).forEach(w => {
      if (w.length > 3 && !STOPWORDS.has(w)) counts[w] = (counts[w]||0)+1;
    });
  }
  return Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,12).map(([word,count])=>({ word, count }));
}

function extractTopics(text) {
  if (!text) return [];
  const topics = [];
  const patterns = [
    /(?:el|la|los|las)\s+([A-ZÁÉÍÓÚ][a-záéíóú]+(?:\s+[a-záéíóú]+)?)/g,
    /#([a-záéíóúA-ZÁÉÍÓÚ\w]+)/g,
  ];
  for (const pat of patterns) {
    let m;
    while ((m=pat.exec(text))!==null && topics.length < 6) {
      const t = m[1].trim();
      if (t.length > 3 && !topics.includes(t)) topics.push(t);
    }
  }
  return topics.slice(0, 5);
}

function estimateReach(result) {
  const base = (result.views||0) + (result.likes||0)*10 + (result.shares||0)*50 + (result.commentsCount||0)*5;
  return Math.max(base, result.views || 0);
}

function classifyImpact(result) {
  const eng = result.engagementRate || 0;
  const views = result.views || 0;
  if (views > 100000 || eng > 10) return '🔥 Viral';
  if (views > 10000  || eng > 5)  return '📈 Alto';
  if (views > 1000   || eng > 2)  return '📊 Medio';
  if (views > 100    || eng > 0.5)return '📉 Bajo';
  return '🔍 Muy bajo';
}

async function buildExecutiveSummary(result) {
  const pos = result.sentimentBreakdown?.POSITIVE || 0;
  const neg = result.sentimentBreakdown?.NEGATIVE || 0;
  const neu = result.sentimentBreakdown?.NEUTRAL  || 0;
  const total = pos + neg + neu || 1;

  const posP = Math.round((pos/total)*100);
  const negP = Math.round((neg/total)*100);
  const views = result.views > 0 ? `${result.views.toLocaleString('es-AR')} visualizaciones,` : '';
  const impact = result.impactLevel || '—';

  let summary = `Publicación con ${impact} de impacto. ${views} ${result.likes?.toLocaleString('es-AR')||0} reacciones y ${result.commentsCount||0} comentarios. `;

  if (total > 0) {
    summary += `Análisis de ${total} comentarios: ${posP}% positivos, ${negP}% negativos. `;
  }

  if (result.overallSentiment === 'POSITIVE') {
    summary += 'El contenido del post genera reacciones mayoritariamente favorables. ';
  } else if (result.overallSentiment === 'NEGATIVE') {
    summary += 'El contenido genera debate y reacciones críticas. Se recomienda monitorear la evolución. ';
  } else {
    summary += 'El contenido genera reacciones mixtas en la audiencia. ';
  }

  if (negP > 40) summary += '⚠️ Atención: alto porcentaje de comentarios negativos que requieren respuesta.';
  else if (posP > 70) summary += '✅ Excelente recepción de la audiencia.';

  return summary.trim();
}

function buildSentimentExplanation(sentiment, score, result) {
  const pct = Math.round(Math.abs(score)*100);
  if (sentiment === 'POSITIVE') return `El contenido tiene un tono positivo (${pct}% de confianza). Transmite mensajes constructivos y genera buena recepción.`;
  if (sentiment === 'NEGATIVE') return `El contenido tiene un tono negativo o crítico (${pct}% de confianza). Puede generar debate o controversia.`;
  return `El contenido tiene un tono neutral o informativo (${pct}% de confianza).`;
}

module.exports = router;
