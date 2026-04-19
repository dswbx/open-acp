import { RealAgentSmokeRunner } from "./RealAgentSmoke.ts";

void RealAgentSmokeRunner.main().then((exitCode) => {
  process.exitCode = exitCode;
});
