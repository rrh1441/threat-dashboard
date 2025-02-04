import { NextResponse } from "next/server";

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
 * Constructs the payload for the Credentials API query.
 *
 * This payload uses:
 * - page: 0, size: 0 so that no individual hits are returned,
 * - highlight enabled,
 * - include_total set to true to get only the total count,
 * - a base query for credential sightings plus any additional keyword terms.
 * - a date range for the day.
 */
function buildDailyPayload(keyword: string, day: string) {
  return {
    page: 0,
    size: 0,
    highlight: { enabled: true },
    include_total: true, // Ensure only totals are returned
    // Base query for credential sightings plus additional keyword terms
    query: `+basetypes:(credential-sighting) ${keyword}`,
    include: {
      date: {
        start: `${day}T00:00:00Z`,
        end: `${day}T23:59:59Z`,
      },
    },
  };
}

/**
 * Calls the Credentials API for a given keyword and day.
 * Returns the total count as a number.
 */
async function fetchDailyTotal(keyword: string, day: string): Promise<number> {
  const payload = buildDailyPayload(keyword, day);
  
  const apiResponse = await fetch(process.env.CREDENTIALS_API_URL as string, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      // Use CREDENTIALS_API_KEY if provided; otherwise fallback to THREAT_API_KEY.
      Authorization: `Bearer ${process.env.CREDENTIALS_API_KEY || process.env.THREAT_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  if (!apiResponse.ok) {
    const errorText = await apiResponse.text();
    throw new Error(`Day ${day} for keyword "${keyword}" => ${apiResponse.status}: ${errorText}`);
  }

  const data = await apiResponse.json();
  // Based on your documentation, the API returns an object with a "hits" key that includes "total".
  if (data.hits && typeof data.hits.total === "number") {
    return data.hits.total;
  }
  // Fallback in case the total is in a different structure
  return data?.total?.value ?? 0;
}

/**
 * The POST handler for the Credentials bulk search endpoint.
 *
 * Expects a JSON POST with a { keyword } body.
 * Iterates over the last 7 days and returns an array of objects,
 * each with a day and its corresponding total count.
 * A delay is applied between each API call to avoid rate limiting.
 */
export async function POST(req: Request) {
  try {
    const { keyword } = (await req.json()) || {};
    if (!keyword) {
      return NextResponse.json({ error: "Missing 'keyword'" }, { status: 400 });
    }

    const days = getLast7DaysExcludingToday();
    let partial = false;
    const dailyResults: Array<{ day: string; total: { value: number; relation: string } }> = [];

    // Loop over each day and fetch the total count
    for (const day of days) {
      try {
        const count = await fetchDailyTotal(keyword, day);
        dailyResults.push({
          day,
          total: {
            value: count,
            relation: "=",
          },
        });
      } catch {
        partial = true;
        break;
      }
      // Delay between calls to avoid rate limiting (adjust the delay as needed)
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }

    return NextResponse.json({ partial, data: dailyResults }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}