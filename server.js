'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');
const crypto = require('crypto');

const app = express();

/* =====================================================
   WORLD WATCH CONFIG
===================================================== */

const PORT = Number(process.env.PORT) || 10000;
const HOST = '0.0.0.0';

const CACHE_TTL = 5 * 60 * 1000;       // 5 minutes
const NEWS_MAX_AGE = 60 * 60 * 1000;   // ONLY 60 minutes
const REQUEST_TIMEOUT = 12000;         // 12 seconds
const MAX_ARTICLES = 60;

const cache = new Map();

/* =====================================================
   TOPICS
===================================================== */

const TOPICS = {
  all: {
    name: 'All',
    query:
      'world OR India OR USA OR China OR Russia OR Ukraine OR Israel OR Iran OR Trump OR markets'
  },

  world: {
    name: 'World',
    query:
      'world OR international OR global'
  },

  india: {
    name: 'India',
    query:
      'India OR Indian'
  },

  business: {
    name: 'Business',
    query:
      'business OR economy OR markets OR stocks OR finance'
  },

  markets: {
    name: 'Markets',
    query:
      'stock market OR NIFTY OR Sensex OR Dow Jones OR Nasdaq OR markets'
  },

  technology: {
    name: 'Technology',
    query:
      'technology OR AI OR artificial intelligence OR cybersecurity'
  },

  sports: {
    name: 'Sports',
    query:
      'sports OR cricket OR football OR tennis'
  },

  usa: {
    name: 'USA',
    query:
      'USA OR United States OR Trump'
  },

  china: {
    name: 'China',
    query:
      'China OR Chinese'
  },

  middleeast: {
    name: 'Middle East',
    query:
      'Israel OR Gaza OR Iran OR Middle East'
  },

  russia: {
    name: 'Russia / Ukraine',
    query:
      'Russia OR Ukraine OR NATO'
  },

  energy: {
    name: 'Energy',
    query:
      'oil OR crude oil OR OPEC OR energy'
  }
};

/* =====================================================
   SECURITY
===================================================== */

app.disable('x-powered-by');

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    referrerPolicy: {
      policy: 'strict-origin-when-cross-origin'
    }
  })
);

app.use(
  cors({
    origin: function (origin, callback) {
      const allowed =
        process.env.ALLOWED_ORIGINS;

      if (!origin) {
        return callback(null, true);
      }

      if (!allowed) {
        return callback(null, true);
      }

      const origins = allowed
        .split(',')
        .map(x => x.trim());

      if (origins.includes(origin)) {
        return callback(null, true);
      }

      return callback(
        new Error('CORS origin not allowed')
      );
    },

    methods: ['GET', 'OPTIONS'],
    credentials: false,
    maxAge: 86400
  })
);

app.use(
  express.json({
    limit: '100kb'
  })
);

/* =====================================================
   RATE LIMIT
===================================================== */

const generalLimiter =
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false,

    message: {
      ok: false,
      error:
        'Too many requests. Please try again later.'
    }
  });

const newsLimiter =
  rateLimit({
    windowMs: 60 * 1000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false,

    message: {
      ok: false,
      error:
        'News request limit reached.'
    }
  });

app.use(generalLimiter);

/* =====================================================
   FETCH WITH TIMEOUT
===================================================== */

async function fetchWithTimeout(
  url,
  options = {},
  timeout = REQUEST_TIMEOUT
) {
  const controller =
    new AbortController();

  const timer = setTimeout(
    () => controller.abort(),
    timeout
  );

  try {
    return await fetch(url, {
      ...options,

      signal:
        controller.signal,

      headers: {
        'User-Agent':
          'WORLD-WATCH/1.0',
        'Accept':
          options.headers?.Accept ||
          '*/*',

        ...(options.headers || {})
      }
    });
  } finally {
    clearTimeout(timer);
  }
}

/* =====================================================
   CACHE
===================================================== */

function getCached(topic) {
  const item = cache.get(topic);

  if (!item) {
    return null;
  }

  if (
    Date.now() - item.timestamp >
    CACHE_TTL
  ) {
    cache.delete(topic);
    return null;
  }

  return item.data;
}

function setCached(topic, data) {
  cache.set(topic, {
    data,
    timestamp: Date.now()
  });
}

/* =====================================================
   TEXT CLEANER
===================================================== */

function cleanText(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value
    .replace(
      /<!\[CDATA\[|\]\]>/g,
      ''
    )
    .replace(
      /<[^>]*>/g,
      ' '
    )
    .replace(
      /&amp;/g,
      '&'
    )
    .replace(
      /&quot;/g,
      '"'
    )
    .replace(
      /&#39;/g,
      "'"
    )
    .replace(
      /&lt;/g,
      '<'
    )
    .replace(
      /&gt;/g,
      '>'
    )
    .replace(
      /\s+/g,
      ' '
    )
    .trim();
}

/* =====================================================
   XML PARSER
===================================================== */

function getXmlValue(
  block,
  tag
) {
  const regex =
    new RegExp(
      `<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`,
      'i'
    );

  const match =
    block.match(regex);

  return match
    ? cleanText(match[1])
    : '';
}

/* =====================================================
   RSS PARSER
===================================================== */

function parseRSS(xml) {
  const articles = [];

  if (
    typeof xml !== 'string'
  ) {
    return articles;
  }

  const items =
    xml.match(
      /<item\b[\s\S]*?<\/item>/gi
    ) || [];

  for (
    const item of items
  ) {
    const title =
      getXmlValue(
        item,
        'title'
      );

    const link =
      getXmlValue(
        item,
        'link'
      );

    const pubDate =
      getXmlValue(
        item,
        'pubDate'
      );

    const description =
      getXmlValue(
        item,
        'description'
      );

    const source =
      getXmlValue(
        item,
        'source'
      );

    if (!title || !link) {
      continue;
    }

    articles.push({
      id: createId(
        title + '|' + link
      ),

      title,

      url:
        normalizeUrl(link),

      source:
        source ||
        'Google News',

      published:
        pubDate
          ? parseDate(pubDate)
          : null,

      description
    });
  }

  return articles;
}

/* =====================================================
   GOOGLE NEWS
===================================================== */

async function fetchGoogleNews(topic) {
  const config =
    TOPICS[topic];

  if (!config) {
    return [];
  }

  const query =
    encodeURIComponent(
      config.query
    );

  const url =
    `https://news.google.com/rss/search?q=${query}&hl=en-IN&gl=IN&ceid=IN:en`;

  const response =
    await fetchWithTimeout(
      url,
      {
        headers: {
          Accept:
            'application/rss+xml, application/xml'
        }
      }
    );

  if (!response.ok) {
    throw new Error(
      `Google News HTTP ${response.status}`
    );
  }

  const xml =
    await response.text();

  return parseRSS(xml);
}

/* =====================================================
   GDELT FALLBACK
===================================================== */

async function fetchGDELT(topic) {
  const config =
    TOPICS[topic];

  if (!config) {
    return [];
  }

  const query =
    encodeURIComponent(
      config.query
    );

  const url =
    `https://api.gdeltproject.org/api/v2/doc/doc?query=${query}&mode=artlist&format=json&maxrecords=100&sort=datedesc`;

  const response =
    await fetchWithTimeout(
      url,
      {
        headers: {
          Accept:
            'application/json'
        }
      }
    );

  if (!response.ok) {
    throw new Error(
      `GDELT HTTP ${response.status}`
    );
  }

  const data =
    await response.json();

  const articles =
    Array.isArray(
      data.articles
    )
      ? data.articles
      : [];

  return articles.map(
    article => ({
      id: createId(
        (article.title || '') +
        '|' +
        (article.url || '')
      ),

      title:
        cleanText(
          article.title || ''
        ),

      url:
        normalizeUrl(
          article.url || ''
        ),

      source:
        cleanText(
          article.domain ||
          article.sourcecountry ||
          'GDELT'
        ),

      published:
        parseGDELTDate(
          article.seendate
        ),

      description:
        cleanText(
          article.snippet || ''
        )
    })
  );
}

/* =====================================================
   DATE PARSING
===================================================== */

function parseDate(value) {
  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return null;
  }

  return date.toISOString();
}

function parseGDELTDate(value) {
  if (
    typeof value !== 'string'
  ) {
    return null;
  }

  const match =
    value.match(
      /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/
    );

  if (!match) {
    return parseDate(value);
  }

  const [
    ,
    year,
    month,
    day,
    hour,
    minute,
    second
  ] = match;

  const date =
    new Date(
      Date.UTC(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour),
        Number(minute),
        Number(second)
      )
    );

  return date.toISOString();
}

/* =====================================================
   URL NORMALIZATION
===================================================== */

function normalizeUrl(value) {
  if (
    typeof value !== 'string' ||
    !value
  ) {
    return '';
  }

  try {
    const url =
      new URL(value);

    const tracking =
      [
        'utm_source',
        'utm_medium',
        'utm_campaign',
        'utm_term',
        'utm_content',
        'fbclid',
        'gclid'
      ];

    tracking.forEach(
      parameter => {
        url.searchParams.delete(
          parameter
        );
      }
    );

    return url.toString();
  } catch {
    return '';
  }
}

/* =====================================================
   ID
===================================================== */

function createId(value) {
  return crypto
    .createHash('sha256')
    .update(
      String(value)
    )
    .digest('hex')
    .slice(0, 16);
}

/* =====================================================
   ONLY LAST 60 MINUTES
===================================================== */

function isFresh(article) {
  if (
    !article ||
    !article.published
  ) {
    return false;
  }

  const published =
    new Date(
      article.published
    ).getTime();

  if (
    !Number.isFinite(
      published
    )
  ) {
    return false;
  }

  const age =
    Date.now() - published;

  /*
    Reject:
    - future timestamps
    - older than 60 minutes
  */

  return (
    age >= 0 &&
    age <= NEWS_MAX_AGE
  );
}

/* =====================================================
   FRESHNESS SCORE
===================================================== */

function freshnessScore(article) {
  if (
    !isFresh(article)
  ) {
    return -9999;
  }

  const published =
    new Date(
      article.published
    ).getTime();

  const age =
    Date.now() -
    published;

  const minutes =
    age / 60000;

  return 100 - minutes;
}

/* =====================================================
   DEDUPLICATION
===================================================== */

function deduplicate(articles) {
  const seen =
    new Set();

  const result = [];

  for (
    const article of articles
  ) {
    const titleKey =
      cleanText(
        article.title
      )
        .toLowerCase()
        .replace(
          /[^a-z0-9\u0900-\u097f]+/g,
          ' '
        )
        .trim();

    const urlKey =
      normalizeUrl(
        article.url
      );

    const key =
      titleKey ||
      urlKey;

    if (!key) {
      continue;
    }

    if (
      seen.has(key)
    ) {
      continue;
    }

    seen.add(key);

    result.push(article);
  }

  return result;
}

/* =====================================================
   SORT
===================================================== */

function sortArticles(articles) {
  return articles.sort(
    (a, b) =>
      freshnessScore(b) -
      freshnessScore(a)
  );
}

/* =====================================================
   GET NEWS
===================================================== */

async function getNews(topic) {

  const cached =
    getCached(topic);

  if (cached) {
    return cached;
  }

  let articles = [];

  /*
   Primary source
  */

  try {
    articles =
      await fetchGoogleNews(
        topic
      );
  } catch (error) {
    console.error(
      '[Google News]',
      error.message
    );
  }

  /*
   Fallback source
  */

  if (
    articles.length === 0
  ) {
    try {
      articles =
        await fetchGDELT(
          topic
        );
    } catch (error) {
      console.error(
        '[GDELT]',
        error.message
      );
    }
  }

  /*
   Basic validation
  */

  articles =
    articles.filter(
      article =>
        article.title &&
        article.url
    );

  /*
   VERY IMPORTANT:
   ONLY LAST 60 MINUTES
  */

  articles =
    articles.filter(
      isFresh
    );

  /*
   Remove duplicates
  */

  articles =
    deduplicate(
      articles
    );

  /*
   Newest first
  */

  articles =
    sortArticles(
      articles
    );

  /*
   Maximum 60 stories
  */

  articles =
    articles.slice(
      0,
      MAX_ARTICLES
    );

  /*
   Cache even empty result.
   This prevents hammering news sources.
  */

  setCached(
    topic,
    articles
  );

  return articles;
}

/* =====================================================
   NEWS API
===================================================== */

app.get(
  '/api/news',
  newsLimiter,
  async (req, res) => {

    try {

      let topic =
        typeof req.query.topic ===
        'string'
          ? req.query.topic
              .toLowerCase()
              .trim()
          : 'all';

      if (
        !TOPICS[topic]
      ) {

        return res
          .status(400)
          .json({
            ok: false,

            error:
              'Invalid topic',

            availableTopics:
              Object.keys(
                TOPICS
              )
          });
      }

      const articles =
        await getNews(
          topic
        );

      return res.json({

        ok: true,

        topic,

        topicName:
          TOPICS[topic].name,

        count:
          articles.length,

        freshness:
          'LAST 60 MINUTES ONLY',

        cacheTTL:
          CACHE_TTL,

        updatedAt:
          new Date()
            .toISOString(),

        articles
      });

    } catch (error) {

      console.error(
        '[NEWS API]',
        error.message
      );

      return res
        .status(500)
        .json({

          ok: false,

          error:
            'Unable to load fresh news.'

        });
    }
  }
);

/* =====================================================
   STATUS
===================================================== */

app.get(
  '/api/status',
  (req, res) => {

    const status = {};

    for (
      const topic of
      Object.keys(TOPICS)
    ) {

      const item =
        cache.get(topic);

      status[topic] = {

        cached:
          Boolean(item),

        age:
          item
            ? Date.now() -
              item.timestamp
            : null,

        expiresIn:
          item
            ? Math.max(
                0,
                CACHE_TTL -
                (
                  Date.now() -
                  item.timestamp
                )
              )
            : null
      };
    }

    res.json({

      ok: true,

      service:
        'WORLD WATCH',

      rule:
        'ONLY NEWS FROM LAST 60 MINUTES',

      refresh:
        'EVERY 5 MINUTES',

      timestamp:
        new Date()
          .toISOString(),

      cacheTTL:
        CACHE_TTL,

      maxNewsAge:
        NEWS_MAX_AGE,

      topics:
        Object.keys(
          TOPICS
        ),

      cache:
        status
    });
  }
);

/* =====================================================
   HEALTH
===================================================== */

app.get(
  '/health',
  (req, res) => {

    res.status(200).json({

      ok: true,

      status:
        'healthy',

      service:
        'WORLD WATCH',

      newsRule:
        '60 MINUTES ONLY',

      uptime:
        Math.round(
          process.uptime()
        ),

      timestamp:
        new Date()
          .toISOString()
    });
  }
);

/* =====================================================
   API 404
===================================================== */

app.use(
  '/api',
  (req, res) => {

    res.status(404).json({

      ok: false,

      error:
        'API endpoint not found'
    });
  }
);

/* =====================================================
   FRONTEND
===================================================== */

const publicPath =
  path.join(
    __dirname,
    'public'
  );

app.use(
  express.static(
    publicPath,
    {
      dotfiles: 'deny',

      index:
        'index.html',

      maxAge:
        process.env.NODE_ENV ===
        'production'
          ? '1h'
          : 0
    }
  )
);

/* =====================================================
   SPA FALLBACK
===================================================== */

app.get(
  '*',
  (req, res, next) => {

    if (
      req.path.startsWith(
        '/api/'
      )
    ) {
      return next();
    }

    res.sendFile(
      path.join(
        publicPath,
        'index.html'
      )
    );
  }
);

/* =====================================================
   ERROR HANDLER
===================================================== */

app.use(
  (
    error,
    req,
    res,
    next
  ) => {

    console.error(
      '[SERVER ERROR]',
      error.message
    );

    if (
      res.headersSent
    ) {
      return next(error);
    }

    res
      .status(500)
      .json({

        ok: false,

        error:
          'Internal server error'
      });
  }
);

/* =====================================================
   PROCESS ERROR HANDLERS
===================================================== */

process.on(
  'unhandledRejection',
  error => {

    console.error(
      '[UNHANDLED REJECTION]',
      error
    );
  }
);

process.on(
  'uncaughtException',
  error => {

    console.error(
      '[UNCAUGHT EXCEPTION]',
      error
    );

    setTimeout(
      () => process.exit(1),
      1000
    );
  }
);

/* =====================================================
   START SERVER
===================================================== */

const server =
  app.listen(
    PORT,
    HOST,
    () => {

      console.log(
        '======================================'
      );

      console.log(
        '       WORLD WATCH SERVER'
      );

      console.log(
        '======================================'
      );

      console.log(
        `PORT: ${PORT}`
      );

      console.log(
        `NEWS AGE: ONLY LAST 60 MINUTES`
      );

      console.log(
        `REFRESH: EVERY 5 MINUTES`
      );

      console.log(
        `SOURCES: GOOGLE NEWS + GDELT`
      );

      console.log(
        `SECURITY: HELMET + RATE LIMIT`
      );

      console.log(
        '======================================'
      );
    }
  );

/* =====================================================
   GRACEFUL SHUTDOWN
===================================================== */

function shutdown(signal) {

  console.log(
    `${signal} received.`
  );

  server.close(
    () => {

      console.log(
        'Server closed.'
      );

      process.exit(0);
    }
  );

  setTimeout(
    () => {
      process.exit(1);
    },
    10000
  );
}

process.on(
  'SIGTERM',
  () => shutdown('SIGTERM')
);

process.on(
  'SIGINT',
  () => shutdown('SIGINT')
);
