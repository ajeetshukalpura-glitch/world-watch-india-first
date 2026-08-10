const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.static(path.join(__dirname, "public")));

// Live World News — GDELT
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
      `?query=${encodeURIComponent(query)}` +
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
      topic,
      updatedAt: new Date().toISOString(),
      count: articles.length,
      articles
    });
  } catch (error) {
    console.error("News API error:", error);

    res.status(502).json({
      ok: false,
      error: "Live news source is temporarily unavailable.",
      detail: error.message
    });
  }
});

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "World Watch API is Live",
    project: "WORLD WATCH — INDIA FIRST",
    time: new Date().toISOString()
  });
});

// Frontend fallback
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Start server
app.listen(PORT, () => {
  console.log(
    `🌍 WORLD WATCH — INDIA FIRST running on port ${PORT}`
  );
});
