import { Link } from "wouter";

export default function NotFound() {
  return (
    <div className="min-h-[50vh] flex flex-col items-center justify-center text-center">
      <div className="text-4xl font-bold text-muted-foreground/30 mb-3">404</div>
      <h1 className="text-lg font-semibold text-foreground mb-2">Page not found</h1>
      <p className="text-sm text-muted-foreground mb-6">
        This page does not exist in the unit economics tool.
      </p>
      <Link href="/">
        <a className="text-sm text-primary hover:underline">Go to Setup</a>
      </Link>
    </div>
  );
}
