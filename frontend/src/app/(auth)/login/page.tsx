import LoginForm from "@/features/auth/components/LoginForm";

export default function LoginPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <p className="text-sm text-muted-foreground mt-1">Welcome back to Ajmo</p>
      </div>
      <LoginForm />
    </div>
  );
}
