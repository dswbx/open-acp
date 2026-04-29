import { create } from "zustand";
import { getMainviewRoute, type MainviewRoute } from "./mainviewRoute.ts";

interface RouteState {
  route: MainviewRoute;
  setRoute: (route: MainviewRoute) => void;
}

export const useRouteStore = create<RouteState>()((set) => ({
  route: "app",
  setRoute: (route) => {
    set({ route });
  },
}));

export function hydrateRouteFromLocation(location: Pick<Location, "search">): void {
  useRouteStore.setState({ route: getMainviewRoute(location) });
}

export function navigateTo(route: MainviewRoute): void {
  const params = new URLSearchParams(window.location.search);
  if (route === "app") {
    params.delete("view");
  } else {
    params.set("view", route);
  }
  const search = params.toString();
  const nextUrl = `${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash}`;
  window.history.pushState({ route }, "", nextUrl);
  useRouteStore.setState({ route });
}

export function startRoutePopStateListener(): () => void {
  const handler = () => {
    useRouteStore.setState({ route: getMainviewRoute(window.location) });
  };
  window.addEventListener("popstate", handler);
  return () => {
    window.removeEventListener("popstate", handler);
  };
}
