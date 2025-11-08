import dotenv from "dotenv";
dotenv.config(); // Must be called before using process.env

import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);