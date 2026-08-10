const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

const publicPath = path.join(__dirname, "public");

// Serve frontend files
app.use(express.static(publicPath));

/* =========================================
   LIVE WORLD NEWS — GDELT
========================================= */

app.get("/api/news", async (req, res) => {
  try {
    const topic = String(req.query.topic || "world")
      .trim()
      .toLowerCase()
      .slice(0, 50);

    const queries = {
      world: "(world OR geopolitics OR international)",
      india: "(India OR Indian)",
      usa: "(United States OR USA OR Washington)",
      china: "(China OR Beijing)",
      middleeast:
        "(Middle East OR Israel OR Iran OR Gaza OR Gulf OR Hormuz)",
      russia: "(Russia OR Ukraine)",
      energy: "(oil OR crude OR OPEC OR energy)",
      markets:
        "(markets OR stocks OR bonds OR dollar OR inflation)"
    };

    const query = queries[topic] || queries.world;

    const gdeltUrl =
      "https://api.gdeltproject.org/api/v2/doc/doc" +
      "?query=" +
      encodeURIComponent(query) +
      "&mode=artlist" +
      "&format=json" +
      "&maxrecords=30" +
      "&sort=datedesc" +
      "&timespan=6h";

    const response = await fetch(gdeltUrl, {
      headers: {
        "User-Agent": "World-Watch-India-First/1.0"
      }
    });

    if (!response.ok) {
      throw new Error(`GDELT HTTP ${response.status}`);
    }

    const data = await response.json();

    const articles = (data.articles || []).map((article) => ({
      title: article.title || "Untitled",
      url: article.url || "#",
      domain: article.domain || "",
      sourcecountry: article.sourcecountry || "",
      language: article.language || "",
      seendate: article.seendate || ""
    }));

    res.json({
      ok: true,
      topic: topic,
      updatedAt: new Date().toISOString(),
      count: articles.length,
      articles: articles
    });

  } catch (error) {

    console.error("GDELT News Error:", error);

    res.status(502).json({
      ok: false,
      error: "Live news source is temporarily unavailable.",
      detail: error.message
    });
  }
});


/* =========================================
   HEALTH CHECK
========================================= */

app.get("/health", (req, res) => {
  res.json({
    status: "World Watch API is Live",
    project: "WORLD WATCH — INDIA FIRST",
    server: "Node.js + Express",
    time: new Date().toISOString()
  });
});


/* =========================================
   API STATUS
========================================= */

app.get("/api/status", (req, res) => {
  res.json({
    ok: true,
    message: "WORLD WATCH is running",
    news: "GDELT",
    markets: "TradingView",
    refresh: "5 minutes",
    time: new Date().toISOString()
  });
});


/* =========================================
   FRONTEND FALLBACK
   Express 5 compatible
========================================= */

app.use((req, res) => {
  res.sendFile(path.join(publicPath, "index.html"));
});


/* =========================================
   ERROR HANDLER
========================================= */

app.use((err, req, res, next) => {
  console.error("Server Error:", err);

  res.status(500).json({
    ok: false,
    error: "Internal server error"
  });
});


/* =========================================
   START SERVER
========================================= */

app.listen(PORT, () => {
  console.log("");
  console.log("======================================");
  console.log("🌍 WORLD WATCH — INDIA FIRST");
  console.log("======================================");
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 News API: /api/news`);
  console.log(`❤️ Health: /health`);
  console.log(`📊 Status: /api/status`);
  console.log("======================================");
});
