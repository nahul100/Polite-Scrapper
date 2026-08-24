const axios = require("axios");
const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");
const { z } = require("zod");

const START_URL =
  "https://books.toscrape.com/catalogue/page-1.html";

const cacheDir = path.join(__dirname, "..", "cache");
const outputDir = path.join(__dirname, "..", "output");

const sleep = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));


// ================================
// STAGE 4: BOOK SCHEMA
// ================================
const BookSchema = z.object({
  title: z.string().min(1),
  product_url: z.string().url(),
  price_text: z.string().min(1),
  price_gbp: z.number().nonnegative(),
  availability_text: z.string().min(1),
  rating_text: z.string().nullable(),
  description: z.string().nullable(),
  source_page: z.string().url(),
  fetched_at: z.string()
});


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

    fs.writeFileSync(cacheFile, response.data);

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

    return fs.readFileSync(cacheFile, "utf8");
  }

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
// STAGE 4: NORMALIZE RECORD
// ================================
function normalizeRecord(rawRecord) {
  const priceNumber = parseFloat(
    rawRecord.price_text.replace("£", "")
  );

  return {
    ...rawRecord,
    price_gbp: priceNumber
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
  console.log(`catalogue_pages=${cataloguePages}`);
  console.log(`discovered=${bookUrls.length}`);
  console.log(`unique_urls=${bookUrls.length}`);


  console.log(
    "\nSTAGE 3: EXTRACTING BOOK DETAILS\n"
  );

  const rawRecords = [];

  for (let i = 0; i < bookUrls.length; i++) {

    const bookUrl = bookUrls[i];

    const html =
      await getBookPage(
        bookUrl,
        i + 1
      );

    if (!html) continue;

    const sourcePage =
      Math.floor(i / 20) + 1;

    const record =
      extractBookRecord(
        html,
        bookUrl,
        `https://books.toscrape.com/catalogue/page-${sourcePage}.html`
      );

    rawRecords.push(record);
  }


  // ================================
  // STAGE 4: VALIDATE AND STORE
  // ================================
  console.log(
    "\nSTAGE 4: CLEANING AND VALIDATING RECORDS\n"
  );

  const validRecords = [];
  const errors = [];

  for (const rawRecord of rawRecords) {

    const normalizedRecord =
      normalizeRecord(rawRecord);

    const result =
      BookSchema.safeParse(
        normalizedRecord
      );

    if (result.success) {
      validRecords.push(result.data);
    } else {
      errors.push({
        record: normalizedRecord,
        reason: result.error.issues
      });
    }
  }


  // Create output directory
  fs.mkdirSync(outputDir, {
    recursive: true
  });


  // Remove duplicate URLs
  const uniqueRecords = Array.from(
    new Map(
      validRecords.map(
        (record) => [
          record.product_url,
          record
        ]
      )
    ).values()
  );


  // Write valid records
  fs.writeFileSync(
    path.join(outputDir, "books.json"),
    JSON.stringify(
      uniqueRecords,
      null,
      2
    )
  );


  // Write invalid records
  fs.writeFileSync(
    path.join(outputDir, "errors.json"),
    JSON.stringify(
      errors,
      null,
      2
    )
  );


  // ================================
  // CHECKPOINT
  // ================================
  console.log("\nSTAGE 4 CHECKPOINT");

  console.log(
    `books.json records=${uniqueRecords.length}`
  );

  console.log(
    `errors=${errors.length}`
  );

  const allPricesAreNumbers =
    uniqueRecords.every(
      (record) =>
        typeof record.price_gbp === "number"
    );

  const allUrlsAreHttps =
    uniqueRecords.every(
      (record) =>
        record.product_url.startsWith("https://")
    );

  console.log(
    `all_price_gbp_numbers=${allPricesAreNumbers}`
  );

  console.log(
    `all_urls_https=${allUrlsAreHttps}`
  );
}


// Run program
main();