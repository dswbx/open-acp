export type MainviewRoute = "app" | "tool-calls";

export function getMainviewRoute(location: Pick<Location, "search"> | URL): MainviewRoute {
  const params = new URLSearchParams(location.search);
  return params.get("view") === "tool-calls" ? "tool-calls" : "app";
}
