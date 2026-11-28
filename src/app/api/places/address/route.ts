import { NextResponse } from "next/server";
import { addressAt } from "@/lib/places";
import { getSessionUser } from "@/lib/viewer";

// Called by VisitedAddress when the user taps a visited place that has no stored detail.
// Query: lat, lng of that saved place. Body: { address: string | null }.

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const lat = Number(params.get("lat"));
  const lng = Number(params.get("lng"));
  const address = await addressAt(lat, lng);
  return NextResponse.json({ address });
}
