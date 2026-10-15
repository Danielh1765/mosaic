// Vercel entry point. Runs the normal Mosaic server; pages come from Supabase for the signed-in user.
import { handleRequest } from "../server.mjs";

export default handleRequest;
