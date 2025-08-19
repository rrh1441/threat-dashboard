import { NextResponse } from "next/server";
import { parse as parseCSV } from "papaparse";
import { Parser as JSON2CSVParser } from "json2csv";

// Force this route to run in the Node.js runtime.
export const runtime = "nodejs";

/**
 * Returns an array of the last 7 full days (excluding today)
 */
function getLast7DaysExcludingToday(): string[] {
  const days: string[] = [];
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  now.setDate(now.getDate() - 1);
  for (let i = 6; i >= 0; i--) {
    const temp = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    days.push(temp.toISOString().split("T")[0]);
  }
  return days;
}

/**
 * Constructs the payload for the Telegram-specific API query.
 * This is identical to your existing bulk search payload except that it
 * adds a filter to only include posts from Telegram.
 */
function buildDailyPayload(keyword: string, day: string) {
  return {
    page: 0,
    size: 1, // Changed from 0 to 1 - we only need the total count, not the actual results
    highlight: { enabled: true },
    include_total: true,
    query: keyword,
    include: {
      date: {
        start: `${day}T00:00:00Z`,
        end: `${day}T23:59:59Z`,
      },
      site: ["telegram"], // Narrow the search to Telegram posts
    },
  };
}

/**
 * Calls your API for a given keyword and day.
 * Returns the total count as a number.
 * Includes retry logic for handling transient failures.
 */
async function fetchDailyTotal(keyword: string, day: string, maxRetries = 3): Promise<{ count: number; hadRetries: boolean }> {
  let hadRetries = false;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const payload = buildDailyPayload(keyword, day);
      
      // Add request timeout to prevent hanging requests
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
      
      const apiResponse = await fetch(process.env.THREAT_API_URL as string, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.THREAT_API_KEY}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (!apiResponse.ok) {
        const errorText = await apiResponse.text();
        
        // Handle rate limiting (429) with longer backoff
        if (apiResponse.status === 429 && attempt < maxRetries) {
          hadRetries = true;
          const rateLimitDelay = Math.min(Math.pow(3, attempt) * 5000, 60000); // 15s, 45s, max 60s
          console.warn(`Rate limited for ${keyword} on ${day}, retrying in ${rateLimitDelay/1000}s...`);
          await new Promise(resolve => setTimeout(resolve, rateLimitDelay));
          continue;
        }
        
        // If it's a server error (5xx) and we have retries left, continue
        if (apiResponse.status >= 500 && attempt < maxRetries) {
          hadRetries = true;
          console.warn(`Attempt ${attempt} failed for ${keyword} on ${day} (${apiResponse.status}), retrying in ${Math.pow(2, attempt)}s...`);
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
          continue;
        }
        throw new Error(`Day ${day} for keyword "${keyword}" => ${apiResponse.status}: ${errorText}`);
      }
      
      const data = await apiResponse.json();
      return { count: data?.total?.value ?? 0, hadRetries };
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }
      
      // Handle timeout and other network errors
      const isTimeoutOrNetworkError = error instanceof Error && 
        (error.name === 'AbortError' || error.message.includes('fetch'));
      
      if (isTimeoutOrNetworkError) {
        hadRetries = true;
        console.warn(`Attempt ${attempt} failed for ${keyword} on ${day} (network/timeout), retrying in ${Math.pow(2, attempt)}s...`);
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        continue;
      }
      
      // For non-retryable errors, throw immediately
      throw error;
    }
  }
  return { count: 0, hadRetries };
}

/**
 * The POST handler for the Bulk Search – Telegram endpoint.
 *
 * Expects a multipart/form-data POST with a file field named "file".
 * The CSV file should contain one keyword per row (first column).
 * For each keyword, it iterates over the last 7 days, calling the API
 * with a 250ms delay between calls. It builds a CSV using internal keys,
 * then post-processes the header row so that the final CSV shows the actual date strings.
 */
export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }
    const csvText = await file.text();
    const { data: rows }: { data: string[][] } = parseCSV(csvText, {
      header: false,
      skipEmptyLines: true,
    });
    const keywords: string[] = rows.map((row: string[]) => row[0]).filter(Boolean);
    if (keywords.length === 0) {
      return NextResponse.json({ error: "CSV is empty or invalid" }, { status: 400 });
    }
    const days = getLast7DaysExcludingToday();
    const results: Array<Record<string, number | string>> = [];
    const retryLog: string[] = [];
    const startTime = Date.now();
    const TIMEOUT_LIMIT = 280000; // 280 seconds, leaving 20s buffer before Vercel's 300s limit
    
    // For each keyword in the CSV file
    for (const keyword of keywords) {
      const rowData: Record<string, number | string> = { keyword };
      // For each day, fetch the Telegram-specific count and delay 100ms between calls
      for (const day of days) {
        // Check if we're approaching timeout limit
        if (Date.now() - startTime > TIMEOUT_LIMIT) {
          console.warn(`Approaching timeout limit, stopping processing at keyword "${keyword}" day "${day}"`);
          retryLog.push(`Processing stopped due to timeout - not all keywords completed`);
          break;
        }
        
        try {
          const result = await fetchDailyTotal(keyword, day);
          // Use the actual day string as the key so that later we can replace headers
          rowData[day] = result.count;
          
          // Track successful retries for user notification
          if (result.hadRetries) {
            retryLog.push(`Successfully recovered "${keyword}" on ${day} after retries`);
          }
        } catch (error) {
          console.error(`Error processing keyword "${keyword}" on ${day}:`, {
            keyword,
            day,
            error: error instanceof Error ? error.message : error,
            timestamp: new Date().toISOString(),
            stack: error instanceof Error ? error.stack : undefined
          });
          retryLog.push(`Failed to process "${keyword}" on ${day} after retries`);
          rowData[day] = 0;
        }
        await new Promise((resolve) => setTimeout(resolve, 100)); // Reduced from 250ms to 100ms
      }
      results.push(rowData);
      
      // Check timeout between keywords too
      if (Date.now() - startTime > TIMEOUT_LIMIT) {
        console.warn(`Timeout limit reached, processed ${results.length}/${keywords.length} keywords`);
        retryLog.push(`Processing incomplete: ${results.length}/${keywords.length} keywords processed due to timeout`);
        break;
      }
    }
    // Build header fields using the actual date strings.
    const fields = ["keyword", ...days];
    const json2csvParser = new JSON2CSVParser({ fields });
    let outputCsv = json2csvParser.parse(results);
    
    // Add retry information as comments at the end of CSV if there were any issues
    if (retryLog.length > 0) {
      outputCsv += "\n\n# Retry Information:\n";
      retryLog.forEach(log => {
        outputCsv += `# ${log}\n`;
      });
      outputCsv += "# Note: Failed requests were retried up to 3 times with exponential backoff\n";
    }
    
    const headers: Record<string, string> = {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="telegram_counts.csv"',
    };
    
    // Add retry count to response headers for programmatic access
    if (retryLog.length > 0) {
      headers["X-Retry-Count"] = retryLog.length.toString();
      headers["X-Retry-Info"] = "Some requests required retries due to API errors";
    }
    
    return new Response(outputCsv, {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error("Bulk Telegram API Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}