"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import AnnouncementModal from "./AnnouncementModal";

type Props = {
  paramName?: string;
};

export default function QueryAnnouncement({ paramName = "notice" }: Props) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const value = searchParams.get(paramName);
    setMessage(value);
  }, [paramName, searchParams]);

  const handleClose = () => {
    setMessage(null);
    const params = new URLSearchParams(searchParams.toString());
    params.delete(paramName);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  if (!message) return null;

  return <AnnouncementModal message={message} onClose={handleClose} />;
}

