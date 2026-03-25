"use client";

import { signIn } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function SignInPage() {
  return (
    <div className="flex min-h-[80vh] items-center justify-center">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Sign in</CardTitle>
          <CardDescription>
            A Discord account is required to post trades and send trade offers.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            className="w-full bg-[#5865F2] hover:bg-[#4752C4] text-white"
            onClick={() => signIn.social({ provider: "discord", callbackURL: "/" })}
          >
            Continue with Discord
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
