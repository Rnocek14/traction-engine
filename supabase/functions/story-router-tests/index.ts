// Stub — this function exists only as a test host.
// Returns 404 in production to avoid accidental surface area.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: { "Access-Control-Allow-Origin": "*" } });
  }
  return new Response(JSON.stringify({ status: "test-only", message: "This endpoint is for testing only" }), {
    status: 404,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
});
