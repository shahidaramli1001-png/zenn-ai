import { useEffect, useState } from "react";

// Public API base URL shown in docs. Set VITE_PUBLIC_API_URL after deployment
// (e.g. https://api.example.com); otherwise this site's own origin is used.
const FALLBACK = "https://api.example.com";

export function useApiBase() {
  const env = (import.meta.env["VITE_PUBLIC_API_URL"] as string | undefined)?.replace(/\/+$/, "");
  const [base, setBase] = useState(env || FALLBACK);
  useEffect(() => {
    if (!env) setBase(window.location.origin);
  }, [env]);
  return base;
}
