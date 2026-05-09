export default function LoginPage() {
  return (
    <div className="min-h-screen bg-[#f0f4f8] flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-sm p-10 text-center max-w-sm w-full">
        <h1 className="text-3xl font-bold text-[#1a56db] mb-2">Azul</h1>
        <p className="text-gray-500 mb-8">Smart Irrigation Control</p>
        <a
          href="/api/auth/login"
          className="block w-full bg-[#1a56db] text-white font-semibold py-3 rounded-lg hover:bg-blue-700 transition-colors"
        >
          Sign In
        </a>
      </div>
    </div>
  );
}
