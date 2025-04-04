import { NextResponse } from "next/server";
import { Parser as JSON2CSVParser } from "json2csv";

/**
 * Returns an array of 12 objects representing the last 12 full months (excluding the current month).
 * Each object contains:
 *  - start: ISO string for the first day of the month at 00:00:00Z
 *  - end: ISO string for the last day of the month at 23:59:59Z
 *  - label: A label in the form "YYYY-MM"
 */
function getLast12MonthsExcludingCurrent(): { start: string; end: string; label: string }[] {
  const months: { start: string; end: string; label: string }[] = [];
  const now = new Date();
  // Set current date to the first day of this month, at 00:00:00
  now.setDate(1);
  now.setHours(0, 0, 0, 0);
  // Exclude the current month by starting with the previous month.
  for (let i = 1; i <= 12; i++) {
    const temp = new Date(now);
    temp.setMonth(temp.getMonth() - i);
    // Start of the month:
    const startDate = new Date(temp.getFullYear(), temp.getMonth(), 1);
    // End of the month:
    const endDate = new Date(temp.getFullYear(), temp.getMonth() + 1, 0);
    // Format as ISO date string (YYYY-MM-DD) with fixed times:
    const start = startDate.toISOString().split("T")[0] + "T00:00:00Z";
    const end = endDate.toISOString().split("T")[0] + "T23:59:59Z";
    // Label as "YYYY-MM"
    const label = startDate.toISOString().split("T")[0].slice(0, 7);
    months.push({ start, end, label });
  }
  return months.reverse();
}

/**
 * Constructs the payload for the API query.
 * This is the same as your daily payload but accepts arbitrary start/end dates.
 */
function buildMonthlyPayload(keyword: string, start: string, end: string) {
  return {
    page: 0,
    size: 0,
    highlight: { enabled: true },
    include_total: true,
    query: keyword,
    include: {
      date: {
        start,
        end,
      },
    },
  };
}

/**
 * Calls your API for a given keyword and month (with start and end dates).
 * Returns the total count as a number.
 */
async function fetchMonthlyTotal(keyword: string, start: string, end: string): Promise<number> {
  const payload = buildMonthlyPayload(keyword, start, end);

  const apiResponse = await fetch(process.env.THREAT_API_URL as string, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.THREAT_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  if (!apiResponse.ok) {
    const errorText = await apiResponse.text();
    throw new Error(`Month ${start} to ${end} for keyword "${keyword}" => ${apiResponse.status}: ${errorText}`);
  }

  const data = await apiResponse.json();
  return data?.total?.value ?? 0;
}

/**
 * The POST handler for the monthly search endpoint.
 *
 * Expects a JSON POST with a { keyword } body.
 * Iterates over the last 12 months, calls the API for each month,
 * and builds a CSV where the header row uses the actual month labels.
 * A 250ms delay is applied between API calls.
 */
export async function POST(req: Request) {
  try {
    const { keyword } = (await req.json()) || {};
    if (!keyword) {
      return NextResponse.json({ error: "Missing 'keyword'" }, { status: 400 });
    }

    const months = getLast12MonthsExcludingCurrent();
    // Build a single row with the keyword and monthly counts (using internal keys)
    const resultRow: Record<string, number | string> = { keyword };

    for (let i = 0; i < months.length; i++) {
      const { start, end, label } = months[i];
      try {
        const count = await fetchMonthlyTotal(keyword, start, end);
        resultRow[`month${i + 1}`] = count;
      } catch (error) {
        console.error(`Error processing keyword "${keyword}" for month ${label}:`, error);
        resultRow[`month${i + 1}`] = 0;
      }
      // 250ms delay to avoid rate limiting (adjust as needed)
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    // Build CSV fields using the internal keys.
    const fields = ["keyword", ...months.map((_, i) => `month${i + 1}`)];
    const json2csvParser = new JSON2CSVParser({ fields });
    const rawCsv = json2csvParser.parse([resultRow]);

    // Post-process the CSV header: replace internal keys ("month1", "month2", etc.)
    // with the actual month labels from the months array.
    const csvLines = rawCsv.split("\n");
    if (csvLines.length > 0) {
      const headerColumns = csvLines[0].split(",");
      for (let i = 0; i < months.length; i++) {
        headerColumns[i + 1] = months[i].label;
      }
      csvLines[0] = headerColumns.join(",");
    }
    const finalCsv = csvLines.join("\n");

    return new NextResponse(finalCsv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": 'attachment; filename="yearly_monthly_counts.csv"',
      },
    });
  } catch (error) {
    console.error("Monthly API Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}