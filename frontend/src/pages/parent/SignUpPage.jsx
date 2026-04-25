import { SignUp } from '@clerk/clerk-react'

export default function SignUpPage() {
  return (
    <div className="min-h-screen bg-st-green flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-white font-display text-5xl tracking-widest">MINI MULLIGANS</h1>
          <p className="text-st-light/80 font-body text-sm mt-2">Junior Golf · Swing Theory Pasadena</p>
        </div>
        <SignUp routing="path" path="/signup" signInUrl="/login" afterSignUpUrl="/onboarding" />
      </div>
    </div>
  )
}
