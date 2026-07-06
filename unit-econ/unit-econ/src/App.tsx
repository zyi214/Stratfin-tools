import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { StoreProvider } from "@/lib/store";
import { Layout } from "@/components/layout";
import DashboardPage from "@/pages/dashboard";
import SetupPage from "@/pages/setup";
import CalculatorPage from "@/pages/calculator";
import SolverPage from "@/pages/solver";
import ScenariosPage from "@/pages/scenarios";
import MakeVsBuyPage from "@/pages/make-vs-buy";
import FacilityPage from "@/pages/facility";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={DashboardPage} />
        <Route path="/setup" component={SetupPage} />
        <Route path="/calculator" component={CalculatorPage} />
        <Route path="/solver" component={SolverPage} />
        <Route path="/scenarios" component={ScenariosPage} />
        <Route path="/make-vs-buy" component={MakeVsBuyPage} />
        <Route path="/facility" component={FacilityPage} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <StoreProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </StoreProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
