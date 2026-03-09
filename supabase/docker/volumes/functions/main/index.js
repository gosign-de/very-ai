import { serve } from "https://deno.land/std@0.177.0/http/server.ts"

serve(async (_req) => {
  return new Response(JSON.stringify({ message: "Edge Functions ready" }), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  })
})
