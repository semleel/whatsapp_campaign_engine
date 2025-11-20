"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AdminsPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/system/staff");
  }, [router]);

  return <p className="text-sm text-muted-foreground">Redirecting to staff management...</p>;
}
