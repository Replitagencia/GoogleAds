"use client";
import { authClient } from "./auth-client";
export default function Logout() {
  return (
    <button
      className="text-button"
      onClick={async () => {
        const result = await authClient.signOut();
        if (!result.error) window.location.assign("/login");
      }}
    >
      Cerrar sesión
    </button>
  );
}
