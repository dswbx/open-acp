export function getCwdTopLevelItem(cwd: string): string {
  if (cwd.includes("/")) {
    return cwd.split("/").pop()!;
  }
  return cwd;
}
