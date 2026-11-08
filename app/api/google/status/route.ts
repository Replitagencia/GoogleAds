import { getChatGPTUser } from "@/app/chatgpt-auth";
import { configuration, connection, json } from "@/lib/google-ads";
export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return json({ error: "Inicia sesión para conectar tu cuenta." }, 401);
  const config = configuration();
  const saved = config.ready ? await connection(user.userId) : null;
  return json({ ...config, connected: !!saved, customerId: saved?.customerId, accountName: saved?.accountName, email: user.email });
}
