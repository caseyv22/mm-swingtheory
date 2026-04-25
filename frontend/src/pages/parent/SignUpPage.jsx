import { SignUp } from '@clerk/clerk-react'
import Logo from '../../components/Logo.jsx'

export default function SignUpPage() {
  return (
    <div className="min-h-screen bg-st-green flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <Logo size="lg" dark={true} />
        </div>
        <SignUp
          routing="path"
          path="/signup"
          signInUrl="/login"
          forceRedirectUrl="/onboarding"
        />
      </div>
    </div>
  )
}
