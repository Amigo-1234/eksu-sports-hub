import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase session cookie for staff routes (/op, /admin, /auth)
 * and sends signed-out visitors to the right login page. Authorization itself
 * happens on the server (requireAdmin) and in Postgres (RLS + RPC checks on
 * auth.uid()); this is only session plumbing.
 */
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const path = request.nextUrl.pathname;
  const area = path.startsWith("/admin") ? "admin" : path.startsWith("/auth") ? "auth" : "op";

  // The operator console may run on the in-browser demo backend (no session).
  if (area === "op" && process.env.NEXT_PUBLIC_OPERATOR_BACKEND !== "supabase") {
    return NextResponse.next({ request });
  }
  if (!url || !key) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  if (data.user || area === "auth") return response;

  const loginPath = area === "admin" ? "/admin/login" : "/op/login";
  if (path.startsWith(loginPath)) return response;
  const login = request.nextUrl.clone();
  login.pathname = loginPath;
  login.search = "";
  login.searchParams.set("next", path);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/op/:path*", "/admin/:path*", "/auth/:path*"],
};
