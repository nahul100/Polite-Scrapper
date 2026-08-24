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
// STAGE 5: RUN STATISTICS
// ================================
const stats = {
  pages_fetched: 0,
  cache_hits: 0,
  valid_records: 0,
  invalid_records: 0,
  failed_pages: 0
};


// ================================
// FETCH WITH RETRY LOGIC
// ================================
async function fetchPage(url, label) {

  const maxAttempts = 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {

    try {

      const response = await axios.get(url, {
        timeout: 5000,
        headers: {
          "User-Agent":
            "FlyRankIntern-AI/1.0 (polite-scrapper)"
        }
      });

      if (response.status === 200) {
        stats.pages_fetched++;

        console.log(
          `FETCH: ${label}`
        );

        return response.data;
      }

    } catch (error) {

      const status =
        error.response?.status;

      // Do not retry 404 or 403
      if (status === 404 || status === 403) {

        console.error(
          `FAILED: ${label} - HTTP ${status}`
        );

        stats.failed_pages++;

        return null;
      }

      // Retry timeout or server error once
      const isRetryable =
        !status || status >= 500;

      if (
        isRetryable &&
        attempt < maxAttempts
      ) {

        console.log(
          `RETRY: ${label} - attempt ${attempt + 1}`
        );

        await sleep(1000);

        continue;
      }

      console.error(
        `FAILED: ${label} - ${error.message}`
      );

      stats.failed_pages++;

      return null;
    }
  }

  stats.failed_pages++;

  return null;
}


// ================================
// FETCH CATALOGUE PAGE
// ================================
async function getCataloguePage(
  url,
  pageNumber
) {

  const cacheFile = path.join(
    cacheDir,
    `catalogue-page-${pageNumber}.html`
  );

  if (fs.existsSync(cacheFile)) {

    console.log(
      `CACHE HIT: Catalogue Page ${pageNumber}`
    );

    stats.cache_hits++;

    return fs.readFileSync(
      cacheFile,
      "utf8"
    );
  }

  if (pageNumber > 1) {
    await sleep(500);
  }

  const html =
    await fetchPage(
      url,
      `Catalogue Page ${pageNumber}`
    );

  if (!html) {
    return null;
  }

  fs.mkdirSync(
    cacheDir,
    { recursive: true }
  );

  fs.writeFileSync(
    cacheFile,
    html
  );

  return html;
}


// ================================
// FETCH BOOK DETAIL PAGE
// ================================
async function getBookPage(
  url,
  bookNumber
) {

  const cacheFile = path.join(
    cacheDir,
    `book-${bookNumber}.html`
  );

  if (fs.existsSync(cacheFile)) {

    console.log(
      `CACHE HIT: Book ${bookNumber}`
    );

    stats.cache_hits++;

    return fs.readFileSync(
      cacheFile,
      "utf8"
    );
  }

  // Polite delay before real request
  await sleep(500);

  const html =
    await fetchPage(
      url,
      `Book ${bookNumber}`
    );

  if (!html) {
    return null;
  }

  fs.mkdirSync(
    cacheDir,
    { recursive: true }
  );

  fs.writeFileSync(
    cacheFile,
    html
  );

  return html;
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

    if (!html) {
      break;
    }

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
    fetched_at:
      new Date().toISOString()
  };
}


// ================================
// STAGE 4: NORMALIZE RECORD
// ================================
function normalizeRecord(rawRecord) {

  const priceNumber =
    parseFloat(
      rawRecord.price_text.replace(
        "£",
        ""
      )
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

  const startTime = new Date();

  console.log(
    "\nSTAGE 2: DISCOVERING BOOKS\n"
  );


  const {
    cataloguePages,
    bookUrls
  } = await discoverBooks();


  console.log(
    "\nDISCOVERY CHECKPOINT"
  );

  console.log(
    `catalogue_pages=${cataloguePages}`
  );

  console.log(
    `discovered=${bookUrls.length}`
  );

  console.log(
    `unique_urls=${bookUrls.length}`
  );


  // =================================
  // STAGE 5 TEST:
  // Add one intentionally broken URL
  // =================================

  const testUrls = [
    ...bookUrls,

    "https://books.toscrape.com/catalogue/this-book-does-not-exist/index.html"
  ];


  console.log(
    "\nSTAGE 3: EXTRACTING BOOK DETAILS\n"
  );

  const rawRecords = [];


  for (
    let i = 0;
    i < testUrls.length;
    i++
  ) {

    const bookUrl =
      testUrls[i];

    const html =
      await getBookPage(
        bookUrl,
        i + 1
      );


    // One failed page does not stop the run
    if (!html) {

      console.log(
        `SKIPPED: Book ${i + 1}`
      );

      continue;
    }


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
  // STAGE 4: VALIDATE RECORDS
  // ================================
  console.log(
    "\nSTAGE 4: CLEANING AND VALIDATING RECORDS\n"
  );


  const validRecords = [];

  const errors = [];


  for (
    const rawRecord of rawRecords
  ) {

    const normalizedRecord =
      normalizeRecord(rawRecord);


    const result =
      BookSchema.safeParse(
        normalizedRecord
      );


    if (result.success) {

      validRecords.push(
        result.data
      );

    } else {

      errors.push({
        record:
          normalizedRecord,

        reason:
          result.error.issues
      });
    }
  }


  fs.mkdirSync(
    outputDir,
    { recursive: true }
  );


  // Remove duplicate URLs
  const uniqueRecords =
    Array.from(

      new Map(

        validRecords.map(
          (record) => [

            record.product_url,

            record
          ]
        )

      ).values()

    );


  // Write books.json
  fs.writeFileSync(
    path.join(
      outputDir,
      "books.json"
    ),

    JSON.stringify(
      uniqueRecords,
      null,
      2
    )
  );


  // Write errors.json
  fs.writeFileSync(
    path.join(
      outputDir,
      "errors.json"
    ),

    JSON.stringify(
      errors,
      null,
      2
    )
  );


  // ================================
  // STAGE 5: RUN REPORT
  // ================================

  const endTime =
    new Date();

  const durationMs =
    endTime - startTime;


  stats.valid_records =
    uniqueRecords.length;

  stats.invalid_records =
    errors.length;


  const runReport = {

    start_time:
      startTime.toISOString(),

    end_time:
      endTime.toISOString(),

    duration_ms:
      durationMs,

    catalogue_pages:
      cataloguePages,

    pages_fetched:
      stats.pages_fetched,

    cache_hits:
      stats.cache_hits,

    valid_records:
      stats.valid_records,

    invalid_records:
      stats.invalid_records,

    failed_pages:
      stats.failed_pages
  };


  fs.writeFileSync(
    path.join(
      outputDir,
      "run-report.json"
    ),

    JSON.stringify(
      runReport,
      null,
      2
    )
  );


  // ================================
  // FINAL CHECKPOINT
  // ================================

  console.log(
    "\nSTAGE 5 CHECKPOINT"
  );

  console.log(
    `books.json records=${uniqueRecords.length}`
  );

  console.log(
    `failed_pages=${stats.failed_pages}`
  );

  console.log(
    `cache_hits=${stats.cache_hits}`
  );

  console.log(
    `valid_records=${stats.valid_records}`
  );

  console.log(
    `invalid_records=${stats.invalid_records}`
  );

  console.log(
    `duration_ms=${durationMs}`
  );

  console.log(
    "\nRUN COMPLETED SUCCESSFULLY\n"
  );
}


// Run program
main();