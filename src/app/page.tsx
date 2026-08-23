import { AuthProvider } from "@/context/AuthContext";
import { AppRoot } from "@/components/AppRoot";

export default function Home() {
  return (
    <AuthProvider>
      <AppRoot />
    </AuthProvider>
  );
}
