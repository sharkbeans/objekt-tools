import { NextResponse } from "next/server";

export function GET(_request: Request, { params }: { params: { address: string } }) {
  const { address } = params;
  const target = `https://collect.objekt.my/by-wallet/${encodeURIComponent(
    address,
  )}`;
  return NextResponse.redirect(target, 302);
}
