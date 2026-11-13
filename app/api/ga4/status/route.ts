import { requireClient, apiError } from "@/lib/access";
import { ga4Connection } from "@/lib/ga4";
import { json } from "@/lib/google-ads";
export async function GET(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    const c = await ga4Connection(clientId);
    return json({
      connected: !!c,
      propertyId: c?.property_id || null,
      propertyName: c?.property_name || null,
    });
  } catch (e) {
    return apiError(e);
  }
}
