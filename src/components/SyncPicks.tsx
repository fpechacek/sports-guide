import { useState } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function SyncPicks({
  client,
  user,
  note,
  onSignedIn,
}: {
  client: SupabaseClient;
  user: User | null;
  note: string;
  onSignedIn: () => void;
}) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function sendLink() {
    setError("");
    const address = email.trim();
    if (!address.includes("@")) {
      setError("Enter the email you use for this guide.");
      return;
    }
    const { error: authError } = await client.auth.signInWithOtp({
      email: address,
      options: { emailRedirectTo: new URL(import.meta.env.BASE_URL, window.location.origin).href },
    });
    if (authError) {
      setError(authError.message);
      return;
    }
    setSent(true);
  }

  async function signOut() {
    await client.auth.signOut();
    onSignedIn();
  }

  return (
    <div className="sync">
      <div className="sync-panel">
        {user ? (
          <>
            <p>Signed in as {user.email}. Checks on this phone show up on your other devices.</p>
            <Button variant="outline" size="sm" onClick={() => void signOut()}>
              Sign out
            </Button>
          </>
        ) : sent ? (
          <p>Check that email on this phone and tap the link. This browser will stay signed in.</p>
        ) : (
          <>
            <p>Sign in to sync your checks. The guide stays open either way.</p>
            <Input
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@email.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              aria-label="Email"
            />
            <Button onClick={() => void sendLink()}>Email me a link</Button>
          </>
        )}
        {error ? <p className="sync-error">{error}</p> : null}
        {note ? <p className="sync-note">{note}</p> : null}
      </div>
    </div>
  );
}
