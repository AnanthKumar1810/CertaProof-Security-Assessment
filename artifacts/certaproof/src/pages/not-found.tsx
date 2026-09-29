import { Link } from "wouter";
import { AlertCircle, ArrowLeft, Home } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#F6F8FA] p-4">
      <div className="w-full max-w-md bg-white border border-[#DFE5EC] rounded-xl p-8 shadow-sm text-center">
        <div className="w-12 h-12 rounded-full bg-[#FEF2F2] border border-[#FCA5A5] flex items-center justify-center mx-auto mb-4 text-[#B91C1C]">
          <AlertCircle size={24} aria-hidden="true" />
        </div>
        
        <h1 className="text-xl font-semibold text-[#172435] mb-2">
          This page could not be found
        </h1>
        
        <p className="text-sm text-[#526176] mb-6 leading-relaxed">
          The requested security assessment view or resource does not exist or has been moved.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-[#087F78] text-white hover:bg-[#06665F] transition-colors shadow-sm"
          >
            <Home size={16} aria-hidden="true" />
            <span>Back to overview</span>
          </Link>
          <button
            onClick={() => window.history.back()}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border border-[#DFE5EC] text-[#526176] hover:bg-[#F0F3F7] hover:text-[#172435] transition-colors"
          >
            <ArrowLeft size={16} aria-hidden="true" />
            <span>Previous screen</span>
          </button>
        </div>
      </div>
    </div>
  );
}
