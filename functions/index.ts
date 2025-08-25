// qr-generate Edge Function (placeholder)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve((req) => new Response(JSON.stringify({"function":"qr-generate","ok":true}), {"headers":{"content-type":"application/json"}}));
