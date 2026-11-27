import { NextResponse } from "next/server";
import { placeSearchResponse, searchPlaces } from "@/lib/places";
import { getSessionUser } from "@/lib/viewer";

export async function GET(request: Request) {
  const user = await getSessionUser();
  const query = new URL(request.url).searchParams.get("q");
  const result = await placeSearchResponse(user ? { userId: user.id } : null, query, searchPlaces);
  return NextResponse.json(result.body, { status: result.status });
}
