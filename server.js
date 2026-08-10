const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

const publicPath = path.join(__dirname, "public");

app.use(express.json());
app.use(express.static(publicPath));

/* =========================================================
   TOPIC CONFIGURATION
========================================================= */

const TOPICS = {
  world: {
    label: "World",
    query: "world geopolitics international"
  },

  india: {
    label: "India",
    query: "India Indian government economy"
  },

  usa: {
    label: "USA",
    query: "United States USA Washington"
  },

  china: {
    label: "China",
    query: "China Beijing Chinese economy"
  },

  middleeast: {
    label: "Middle East",
    query: "Middle East Israel Iran Gaza Gulf"
  },

  russia: {
    label: "Russia / Ukraine",
    query: "Russia Ukraine war"
  },

  energy: {
    label: "Energy",
    query: "oil crude OPEC energy"
  },

  markets: {
    label: "Markets",
    query: "global markets stocks bonds dollar inflation"
  }
};


/* =========================================================
   GOOGLE NEWS RSS
========================================================= */

function googleNewsUrl(query) {
  return (
    "https://news.google.com/rss/search?q=" +
    encodeURIComponent(query) +
    "&hl=en-IN&gl=IN&ceid=IN:en"
  );
}


/* =========================================================
   XML HELPERS
========================================================= */

function decodeXml(text) {
  return String(text || "")
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}


function stripHtml(text) {
  return String(text || "")
    .replace(/<[^>]*>/g, "")
    .trim();
}


/* =========================================================
   RSS PARSER
========================================================= */

function parseRss(xml) {
  const items = [];

  const matches = xml.match(/<item[\s\S]*?<\/item>/gi) || [];

  for (const item of matches.slice(0, 30)) {

    const titleMatch =
      item.match(/<title[^>]*>([\s\S]*?)<\/title>/i);

    const linkMatch =
      item.match(/<link[^>]*>([\s\S]*?)<\/link>/i);

    const pubDateMatch =
      item.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i);

    const sourceMatch =
      item.match(/<source[^>]*>([\s\S]*?)<\/source>/i);

    const title =
      stripHtml(
        decodeXml(
          titleMatch ? titleMatch[1] : ""
        )
      );

    const url =
      decodeXml(
        linkMatch ? linkMatch[1] : ""
      ).trim();

    const pubDate =
      decodeXml(
        pubDateMatch ? pubDateMatch[1] : ""
      ).trim();

    const source =
      stripHtml(
        decodeXml(
          sourceMatch ? sourceMatch[1] : ""
        )
      );

    if (title && url) {
      items.push({
        title,
        url,
        source: source || "Google News",
        published: pubDate
      });
    }
  }

  return items;
}


/* =========================================================
   GDELT FALLBACK
========================================================= */

async function getGdeltNews(query) {

  const url =
    "https://api.gdeltproject.org/api/v2/doc/doc" +
    "?query=" +
    encodeURIComponent(query) +
    "&mode=artlist" +
    "&format=json" +
    "&maxrecords=30" +
    "&sort=datedesc" +
    "&timespan=24h";

  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "World-Watch-India-First/1.0"
    }
  });

  if (!response.ok) {
    throw new Error(
      "GDELT HTTP " + response.status
    );
  }

  const data = await response.json();

  return (data.articles || []).map(article => ({
    title: article.title || "Untitled",
    url: article.url || "#",
    source:
      article.domain ||
      article.sourcecountry ||
      "GDELT",
    published:
      article.seendate || ""
  }));
}


/* =========================================================
   GOOGLE NEWS
========================================================= */

async function getGoogleNews(query) {

  const url = googleNewsUrl(query);

  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 World-Watch-India-First"
    }
  });

  if (!response.ok) {
    throw new Error(
      "Google News HTTP " +
      response.status
    );
  }

  const xml = await response.text();

  return parseRss(xml);
}


/* =========================================================
   LIVE NEWS API
========================================================= */

app.get("/api/news", async (req, res) => {

  const topicKey =
    String(req.query.topic || "world")
      .toLowerCase()
      .trim();

  const topic =
    TOPICS[topicKey] ||
    TOPICS.world;

  let articles = [];
  let provider = "";

  try {

    // First attempt: Google News RSS
    articles =
      await getGoogleNews(
        topic.query
      );

    provider = "Google News RSS";

  } catch (googleError) {

    console.error(
      "Google News error:",
      googleError.message
    );

    try {

      // Second attempt: GDELT
      articles =
        await getGdeltNews(
          topic.query
        );

      provider = "GDELT";

    } catch (gdeltError) {

      console.error(
        "GDELT error:",
        gdeltError.message
      );

      return res.status(503).json({
        ok: false,
        topic: topicKey,
        error:
          "Live news sources are temporarily unavailable.",
        articles: []
      });
    }
  }

  res.json({
    ok: true,
    topic: topicKey,
    label: topic.label,
    provider,
    updatedAt:
      new Date().toISOString(),
    count: articles.length,
    articles: articles.slice(0, 30)
  });
});


/* =========================================================
   HEALTH
========================================================= */

app.get("/health", (req, res) => {

  res.json({
    ok: true,
    status: "LIVE",
    project:
      "WORLD WATCH — INDIA FIRST",
    server: "Node.js + Express",
    time:
      new Date().toISOString()
  });
});


/* =========================================================
   STATUS
========================================================= */

app.get("/api/status", (req, res) => {

  res.json({
    ok: true,
    project:
      "WORLD WATCH — INDIA FIRST",

    news: [
      "Google News RSS",
      "GDELT fallback"
    ],

    markets:
      "TradingView",

    refresh:
      "5 minutes",

    time:
      new Date().toISOString()
  });
});


/* =========================================================
   FRONTEND FALLBACK
   Express 5 compatible
========================================================= */

app.use((req, res) => {

  res.sendFile(
    path.join(
      publicPath,
      "index.html"
    )
  );
});


/* =========================================================
   ERROR HANDLER
========================================================= */

app.use(
  (err, req, res, next) => {

    console.error(
      "Server error:",
      err
    );

    res.status(500).json({
      ok: false,
      error:
        "Internal server error"
    });
  }
);


/* =========================================================
   START SERVER
========================================================= */

app.listen(PORT, () => {

  console.log(
    "========================================"
  );

  console.log(
    "🌍 WORLD WATCH — INDIA FIRST"
  );

  console.log(
    "========================================"
  );

  console.log(
    "🚀 Server running on port " +
    PORT
  );

  console.log(
    "📰 News: /api/news"
  );

  console.log(
    "❤️ Health: /health"
  );

  console.log(
    "📊 Status: /api/status"
  );

  console.log(
    "========================================"
  );
});
