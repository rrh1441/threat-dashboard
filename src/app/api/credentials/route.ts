// src/app/api/credentials/route.ts

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
 * This builds a payload that includes your base query for credentials
 * (using +basetypes:(credential-sighting)) and sets a date range for the given day.
 *
 * The provided keyword (from the client) is appended to the query, so that you can
 * further refine the search if needed.
 */
function buildDailyPayload(keyword: string, day: string) {
  return {
    page: 0,
    size: 0,
    highlight: { enabled: true },
    // Base query for credential sightings plus any additional keyword terms
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
 * Returns the count as a number.
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
  return data?.total?.value ?? 0;
}

/**
 * The POST handler for the Credentials bulk search endpoint.
 *
 * Expects a JSON POST with a { keyword } body.
 * Iterates over the last 7 days and returns an array of objects,
 * each with a day and its corresponding total count.
 * (A delay is used between each API call to avoid rate limiting.)
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

    // For each day, fetch the count from the Credentials API.
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

      // Delay between API calls (adjust the delay value as needed)
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    return NextResponse.json({ partial, data: dailyResults }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}