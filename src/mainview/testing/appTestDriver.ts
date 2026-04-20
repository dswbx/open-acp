import type {
  AppTestAction,
  AppTestSnapshot,
  AppTestWaitForStateParams,
} from "../../shared/e2e.ts";

export interface AppTestDriver {
  getSnapshot(): Promise<AppTestSnapshot> | AppTestSnapshot;
  waitForState(params: AppTestWaitForStateParams): Promise<AppTestSnapshot> | AppTestSnapshot;
  performAction(action: AppTestAction): Promise<AppTestSnapshot> | AppTestSnapshot;
}

let activeDriver: AppTestDriver | undefined;

export function registerAppTestDriver(driver: AppTestDriver): void {
  activeDriver = driver;
}

export function unregisterAppTestDriver(driver: AppTestDriver): void {
  if (activeDriver === driver) {
    activeDriver = undefined;
  }
}

export function getAppTestDriver(): AppTestDriver {
  if (!activeDriver) {
    throw new Error("App test driver is not ready yet.");
  }
  return activeDriver;
}
