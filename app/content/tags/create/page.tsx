// app/content/tags/create/page.tsx
import { redirect } from "next/navigation";

export default function TagsCreatePage() {
  // We already handle creation on /content/tags,
  // so this route just forwards there.
  redirect("/content/tags");
}
