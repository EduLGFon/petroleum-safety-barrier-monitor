// Login route - renders the credential form without dashboard data.
// This is why it exists: session login lives outside the Dashboard island
// so logged-out users never download the monitor bundle just to sign in.
import { LoginForm } from "../islands/LoginForm.tsx";
import { define } from "../utils.ts";

export default define.page(function Login() {
  return (
    <main
      style={{
        maxWidth: 480,
        margin: "0 auto",
        padding: "var(--d-shell)",
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <LoginForm />
    </main>
  );
});
