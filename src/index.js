const axios = require('axios') ;
const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");

const START_URL = "https://books.toscrape.com/catalogue/page-1.html";
const cacheDir = path.join(__dirname, "..", "cache");

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function getPage(url, pageNumber) {
  const cacheFile = path.join(
    cacheDir,
    `catalogue-page-${pageNumber}.html`
  );

  // Read from cache if available
  if (fs.existsSync(cacheFile)) {
    console.log(`CACHE HIT: Page ${pageNumber}`);

    return fs.readFileSync(cacheFile, "utf8");
  }

  // Wait before making a real request
  if (pageNumber > 1) {
    await sleep(500);
  }

  try {
    const response = await axios.get(url, {
      timeout: 5000,
      headers: {
        "User-Agent": "FlyRankIntern-AI/1.0 (polite-scrapper)"
      }
    });

    if (response.status !== 200) {
      throw new Error(`Unexpected status: ${response.status}`);
    }

    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(cacheFile, response.data);

    console.log(`FETCH: Page ${pageNumber}`);

    return response.data;

  } catch (error) {
    console.error(`FAILED: Page ${pageNumber} - ${error.message}`);
    return null;
  }
}

async function discoverBooks() {
  let currentUrl = START_URL;
  let pageNumber = 1;
  let cataloguePages = 0;

  const bookUrls = new Set();

  while (currentUrl && cataloguePages < 3) {
    const html = await getPage(currentUrl, pageNumber);

    if (!html) break;

    cataloguePages++;

    const $ = cheerio.load(html);

    // Collect every book link
    $("article.product_pod h3 a").each((_, element) => {
      const relativeUrl = $(element).attr("href");

      // Convert relative URL to absolute URL
      const absoluteUrl = new URL(relativeUrl, currentUrl).href;

      bookUrls.add(absoluteUrl);
    });

    // Find the site's own "next" link
    const nextHref = $("li.next a").attr("href");

    if (nextHref) {
      currentUrl = new URL(nextHref, currentUrl).href;
      pageNumber++;
    } else {
      currentUrl = null;
    }
  }

  console.log("\nCHECKPOINT");
  console.log(`catalogue_pages=${cataloguePages}`);
  console.log(`discovered=${bookUrls.size}`);
  console.log(`unique_urls=${bookUrls.size}`);
}

discoverBooks();