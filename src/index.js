const axios = require("axios");
const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");

const START_URL =
  "https://books.toscrape.com/catalogue/page-1.html";

const cacheDir = path.join(__dirname, "..", "cache");

const sleep = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));


// ================================
// FETCH CATALOGUE PAGE
// ================================
async function getCataloguePage(url, pageNumber) {
  const cacheFile = path.join(
    cacheDir,
    `catalogue-page-${pageNumber}.html`
  );

  if (fs.existsSync(cacheFile)) {
    console.log(`CACHE HIT: Catalogue Page ${pageNumber}`);
    return fs.readFileSync(cacheFile, "utf8");
  }

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

    fs.writeFileSync(
      cacheFile,
      response.data
    );

    console.log(`FETCH: Catalogue Page ${pageNumber}`);

    return response.data;

  } catch (error) {
    console.error(
      `FAILED: Catalogue Page ${pageNumber} - ${error.message}`
    );

    return null;
  }
}


// ================================
// FETCH BOOK DETAIL PAGE
// ================================
async function getBookPage(url, bookNumber) {
  const cacheFile = path.join(
    cacheDir,
    `book-${bookNumber}.html`
  );

  if (fs.existsSync(cacheFile)) {
    console.log(`CACHE HIT: Book ${bookNumber}`);

    return fs.readFileSync(
      cacheFile,
      "utf8"
    );
  }

  // Polite delay before real request
  await sleep(500);

  try {
    const response = await axios.get(url, {
      timeout: 5000,
      headers: {
        "User-Agent": "FlyRankIntern-AI/1.0 (polite-scrapper)"
      }
    });

    if (response.status !== 200) {
      throw new Error(
        `Unexpected status: ${response.status}`
      );
    }

    fs.mkdirSync(cacheDir, {
      recursive: true
    });

    fs.writeFileSync(
      cacheFile,
      response.data
    );

    console.log(`FETCH: Book ${bookNumber}`);

    return response.data;

  } catch (error) {
    console.error(
      `FAILED: Book ${bookNumber} - ${error.message}`
    );

    return null;
  }
}


// ================================
// DISCOVER FIRST 3 CATALOGUE PAGES
// ================================
async function discoverBooks() {
  let currentUrl = START_URL;
  let pageNumber = 1;
  let cataloguePages = 0;

  const bookUrls = new Set();

  while (
    currentUrl &&
    cataloguePages < 3
  ) {
    const html =
      await getCataloguePage(
        currentUrl,
        pageNumber
      );

    if (!html) break;

    cataloguePages++;

    const $ = cheerio.load(html);

    // Collect book links
    $("article.product_pod h3 a").each(
      (_, element) => {
        const relativeUrl =
          $(element).attr("href");

        const absoluteUrl =
          new URL(
            relativeUrl,
            currentUrl
          ).href;

        bookUrls.add(absoluteUrl);
      }
    );

    // Find next catalogue page
    const nextHref =
      $("li.next a").attr("href");

    if (nextHref) {
      currentUrl =
        new URL(
          nextHref,
          currentUrl
        ).href;

      pageNumber++;
    } else {
      currentUrl = null;
    }
  }

  return {
    cataloguePages,
    bookUrls: [...bookUrls]
  };
}


// ================================
// EXTRACT RAW BOOK RECORD
// ================================
function extractBookRecord(
  html,
  productUrl,
  sourcePage
) {
  const $ = cheerio.load(html);

  const title =
    $("div.product_main h1")
      .text()
      .trim();

  const priceText =
    $("p.price_color")
      .text()
      .trim();

  const availabilityText =
    $("p.instock.availability")
      .text()
      .replace(/\s+/g, " ")
      .trim();

  const ratingText =
    $("p.star-rating")
      .attr("class")
      ?.split(" ")
      .find(
        (value) =>
          value !== "star-rating"
      ) || null;

  const descriptionElement =
    $("#product_description")
      .next("p");

  const description =
    descriptionElement.length > 0
      ? descriptionElement
          .text()
          .trim()
      : null;

  return {
    title,
    product_url: productUrl,
    price_text: priceText,
    availability_text: availabilityText,
    rating_text: ratingText,
    description,
    source_page: sourcePage,
    fetched_at: new Date().toISOString()
  };
}


// ================================
// MAIN PROGRAM
// ================================
async function main() {

  console.log("\nSTAGE 2: DISCOVERING BOOKS\n");

  const {
    cataloguePages,
    bookUrls
  } = await discoverBooks();

  console.log("\nDISCOVERY CHECKPOINT");
  console.log(
    `catalogue_pages=${cataloguePages}`
  );
  console.log(
    `discovered=${bookUrls.length}`
  );
  console.log(
    `unique_urls=${bookUrls.length}`
  );


  console.log(
    "\nSTAGE 3: EXTRACTING BOOK DETAILS\n"
  );

  const records = [];

  for (
    let i = 0;
    i < bookUrls.length;
    i++
  ) {
    const bookUrl = bookUrls[i];

    const html =
      await getBookPage(
        bookUrl,
        i + 1
      );

    if (!html) continue;

    // Determine which catalogue page
    const sourcePage =
      Math.floor(i / 20) + 1;

    const record =
      extractBookRecord(
        html,
        bookUrl,
        `https://books.toscrape.com/catalogue/page-${sourcePage}.html`
      );

    records.push(record);
  }


  console.log("\nSTAGE 3 CHECKPOINT");

  console.log(
    `detail_pages=${records.length}`
  );

  console.log("\nONE RAW RECORD:");

  console.log(
    JSON.stringify(
      records[0],
      null,
      2
    )
  );
}


// Run program
main();