import RegisterForm from "@/features/auth/components/RegisterForm";

export default function RegisterPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Create account</h1>
        <p className="text-sm text-muted-foreground mt-1">Start planning your trips</p>
      </div>
      <RegisterForm />
    </div>
  );
}
