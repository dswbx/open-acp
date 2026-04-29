export type MainviewRoute = "app" | "tool-calls" | "settings";

export function getMainviewRoute(location: Pick<Location, "search"> | URL): MainviewRoute {
  const params = new URLSearchParams(location.search);
  const view = params.get("view");
  if (view === "tool-calls") {
    return "tool-calls";
  }
  if (view === "settings") {
    return "settings";
  }
  return "app";
}
