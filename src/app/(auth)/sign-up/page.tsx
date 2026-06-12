"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Sign-up is handled by Discord OAuth — redirect to sign-in.
export default function SignUpPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/sign-in");
  }, [router]);
  return null;
}
