# The Polite Scraper

A small, respectful, and fault-tolerant web scraping pipeline built with **Node.js**.

This project was developed as part of the **Backend AI Engineering Internship – Week 5 assignment**. The scraper collects book information from the first three catalogue pages of **Books to Scrape**, validates and normalizes the collected data, caches downloaded pages, handles failures without stopping the entire run, and produces a structured run report.

---

## Goal

The goal of this project is to build a small scraping pipeline that:

- Scrapes the first **3 catalogue pages**
- Discovers **60 book detail pages**
- Extracts structured information from each book
- Converts raw data into validated JSON records
- Caches downloaded HTML to avoid unnecessary repeated requests
- Handles a broken page without crashing the entire scraper
- Generates a final run report

---

## Target Classification

### Target

**Books to Scrape**

### Website

https://books.toscrape.com/

### Why this target was selected

Books to Scrape is a demo website specifically designed for practicing web scraping.

### Scope

This project only collects data from the first **three catalogue pages**, resulting in **60 book records**.

### Data Collected

For each book, the scraper collects:

- Title
- Product URL
- Original price text
- Normalized price in GBP
- Availability
- Rating
- Description
- Source catalogue page
- Fetch timestamp

### Scraping Boundary

This scraper was developed specifically for this assignment and target website.

I will not reuse the scraper on another website without first checking the website's rules, permissions, robots.txt, and terms.

---

# Project Structure

```text
polite-scrapper/
│
├── src/
│   └── index.js
│
├── output/
│   ├── books.json
│   ├── errors.json
│   └── run-report.json
│
├── cache/
│   └── Cached catalogue and book HTML files
│
├── README.md
├── .gitignore
├── package.json
└── package-lock.json
```

The `cache/` directory is excluded from Git because it may contain a large number of downloaded HTML files.

---

# Technologies Used

- Node.js
- Axios
- Cheerio
- Zod
- File System (`fs`)
- Path (`path`)

---

# Installation

Clone the repository:

```bash
git clone YOUR-GITHUB-REPOSITORY-URL
```

Move into the project directory:

```bash
cd polite-scrapper
```

Install the required dependencies:

```bash
npm install
```

---

# Running the Scraper

Run the following command:

```bash
node src/index.js
```

The scraper will:

1. Discover books from the first three catalogue pages.
2. Collect the URLs of 60 books.
3. Fetch and cache each book detail page.
4. Extract raw book information.
5. Normalize the price into a numeric GBP value.
6. Validate every record using a Zod schema.
7. Store valid records in `output/books.json`.
8. Store validation errors in `output/errors.json`.
9. Test failure handling using an intentionally invalid URL.
10. Generate `output/run-report.json`.

---

# Record Schema

Each valid book record follows this structure:

```json
{
  "title": "string",
  "product_url": "string",
  "price_text": "string",
  "price_gbp": "number",
  "availability_text": "string",
  "rating_text": "string or null",
  "description": "string or null",
  "source_page": "string",
  "fetched_at": "string"
}
```

Example:

```json
{
  "title": "A Light in the Attic",
  "product_url": "https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html",
  "price_text": "£51.77",
  "price_gbp": 51.77,
  "availability_text": "In stock (22 available)",
  "rating_text": "Three",
  "description": null,
  "source_page": "https://books.toscrape.com/catalogue/page-1.html",
  "fetched_at": "2026-08-24T..."
}
```

---

# Scraping Workflow

## Stage 0 — Check Before Collecting

Before writing the scraper, the target website was reviewed.

The project uses Books to Scrape because it is a demonstration website created for practicing web scraping.

The scraper is limited to the first three catalogue pages.

---

## Stage 1 — Fetch Once, Cache Once

The scraper:

- Uses an identifiable User-Agent.
- Uses a request timeout.
- Checks HTTP responses.
- Saves downloaded HTML locally.
- Reads from the cache when the same page is requested again.

This prevents unnecessary repeated requests to the website.

Example behavior:

```text
FETCH: Catalogue Page 1
```

On a later run:

```text
CACHE HIT: Catalogue Page 1
```

---

## Stage 2 — Discover Three Catalogue Pages

The scraper follows the website's own `next` links instead of manually constructing all page URLs.

It:

- Starts from catalogue page 1.
- Finds all book URLs.
- Converts relative URLs into absolute URLs.
- Follows the site's `next` link.
- Stops after three catalogue pages.
- Removes duplicate URLs using a `Set`.

Expected result:

```text
catalogue_pages=3
discovered=60
unique_urls=60
```

---

## Stage 3 — Extract Raw Records

The scraper visits each discovered book page and extracts:

- Title
- Product URL
- Price text
- Availability text
- Rating
- Description
- Source page
- Fetch timestamp

Descriptions that are not available are stored as:

```text
null
```

The scraper does not invent missing information.

Each record also keeps provenance information through:

```text
source_page
fetched_at
```

---

## Stage 4 — Clean, Validate, and Store

Raw data is normalized before being stored.

For example:

```text
£51.77
```

is converted into:

```text
51.77
```

The normalized field is stored as:

```text
price_gbp
```

The original value is also preserved as:

```text
price_text
```

Each record is validated using a **Zod schema**.

Valid records are stored in:

```text
output/books.json
```

Invalid records are stored in:

```text
output/errors.json
```

Duplicate records are removed using their canonical `product_url`.

The completed run produces:

```text
books.json records=60
```

---

## Stage 5 — Survive Failures

A single failed page should not stop the entire scraping process.

The scraper handles errors individually and continues processing the remaining URLs.

For testing, one intentionally invalid book URL is included.

The scraper:

- Logs the failed page.
- Skips the failed page.
- Continues processing valid pages.
- Retries temporary failures once.
- Does not retry `404` or `403` responses.

This allows the scraper to complete successfully even when one page fails.

Expected behavior:

```text
FAILED: Book 61 - HTTP 404
SKIPPED: Book 61
```

The valid records remain intact:

```text
books.json records=60
failed_pages=1
valid_records=60
```

---

# Politeness Rules

This scraper follows several practices to minimize unnecessary load on the target website.

### Identifiable User-Agent

Requests include an identifiable User-Agent:

```text
FlyRankIntern-AI/1.0 (polite-scrapper)
```

### Request Timeout

Each request has a timeout so the program does not wait indefinitely.

### Delay Between Real Requests

The scraper waits before making real requests.

Cached pages do not require a delay because they are read locally.

### Local Caching

Downloaded HTML is stored in the local `cache/` directory.

On later runs, cached files are reused instead of requesting the same page again.

### Status Checking

Only successful HTTP responses are processed.

### Limited Retry

Temporary failures such as timeouts or server errors may be retried once.

Responses such as:

```text
404
403
```

are not retried.

---

# Failure Handling

The scraper is designed so that one broken page does not terminate the entire process.

Each page is handled independently.

If a page fails:

1. The failure is logged.
2. The page is skipped.
3. The remaining pages continue processing.
4. The failure is counted in the run report.

This was tested by intentionally adding a non-existent book URL.

The final scraper still produces the 60 valid records.

---

# Output Files

## `output/books.json`

Contains all validated and normalized book records.

Expected result:

```text
60 records
```

---

## `output/errors.json`

Contains records that fail schema validation and the reason for failure.

---

## `output/run-report.json`

Contains information about the completed scraper run, including:

- Start time
- End time
- Duration
- Catalogue pages processed
- Pages fetched
- Cache hits
- Valid records
- Invalid records
- Failed pages

Example structure:

```json
{
  "start_time": "2026-08-24T...",
  "end_time": "2026-08-24T...",
  "duration_ms": 0,
  "catalogue_pages": 3,
  "pages_fetched": 0,
  "cache_hits": 0,
  "valid_records": 60,
  "invalid_records": 0,
  "failed_pages": 1
}
```

> The actual values for `duration_ms`, `pages_fetched`, and `cache_hits` depend on whether the pages were fetched from the website or loaded from the local cache.

---

# Idempotency

The scraper avoids duplicate records.

Each book is identified using its canonical:

```text
product_url
```

Before writing the final output, duplicate URLs are removed.

Therefore, rerunning the scraper does not create 120 records from the same 60 books.

The expected output remains:

```text
60 valid records
```

---

# Why No Browser Was Used

A browser was not necessary for this project because the required book information is already available in the HTML returned directly by the server.

Using a browser would add unnecessary complexity and resource usage.

The scraper therefore uses HTTP requests and HTML parsing instead.

---

# Ethics

This project follows a simple scraping ethics policy:

- Use an official API when one is available and appropriate.
- Check the target before collecting data.
- Respect the intended purpose and scope of the website.
- Do not bypass logins.
- Do not bypass paywalls.
- Do not bypass access restrictions or technical blocks.
- Do not repeatedly hammer a website with unnecessary requests.
- Collect only the data required for the project.

This scraper was intentionally limited to a public demo website designed for web scraping practice.

---

# Limitations

This project has several limitations:

- It is designed specifically for the structure of Books to Scrape.
- It only processes the first three catalogue pages.
- It does not attempt to support arbitrary websites.
- Changes to the target website's HTML structure may require updating the extraction selectors.
- The retry mechanism is intentionally simple and only retries temporary failures once.

---

# Final Results

The completed pipeline successfully:

```text
✓ Processed 3 catalogue pages
✓ Discovered 60 unique book URLs
✓ Extracted 60 book detail pages
✓ Normalized price values
✓ Validated records using Zod
✓ Stored 60 valid records in books.json
✓ Prevented duplicate records
✓ Cached downloaded HTML
✓ Reused cached pages on later runs
✓ Handled an intentionally broken URL
✓ Continued running after the failed page
✓ Generated a run report
```

---

# Conclusion

This project demonstrates a complete small-scale scraping pipeline rather than simply downloading web pages.

The final system checks the target before collection, makes polite HTTP requests, caches responses, discovers pages dynamically, extracts structured data, validates records, handles failures without terminating the run, and reports the outcome of each execution.

The main objective was to build a scraper that is not only functional, but also reproducible, cautious, and able to continue working when individual pages fail.