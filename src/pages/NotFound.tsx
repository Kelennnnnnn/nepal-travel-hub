import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Mountain } from "lucide-react";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { logger } from "@/lib/logger";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    logger.error("404: non-existent route accessed:", location.pathname);
  }, [location.pathname]);

  return (
    <Layout>
      <div className="min-h-[70vh] flex items-center justify-center py-16">
        <div className="text-center px-4 max-w-md mx-auto">
          {/* Mountain illustration */}
          <div className="flex justify-center mb-6">
            <svg
              viewBox="0 0 200 120"
              className="w-48 h-28 text-muted-foreground/20"
              fill="currentColor"
            >
              <polygon points="100,10 160,100 40,100" />
              <polygon points="60,40 110,100 10,100" className="text-muted-foreground/10" fill="currentColor" />
              <polygon points="140,50 185,100 95,100" className="text-muted-foreground/10" fill="currentColor" />
            </svg>
          </div>

          <p className="text-7xl font-bold text-primary mb-4">404</p>
          <h1 className="text-2xl font-bold mb-2">Page Not Found</h1>
          <p className="text-muted-foreground mb-8">
            The page you're looking for doesn't exist or has been moved.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button asChild>
              <Link to="/">Back to Home</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/activities">Browse Activities</Link>
            </Button>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default NotFound;
