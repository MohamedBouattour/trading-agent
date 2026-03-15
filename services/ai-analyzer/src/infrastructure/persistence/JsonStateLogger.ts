import fs from "fs/promises";
import path from "path";
import { AgentState } from "../../domain/agents/entities/AgentState.js";

export class JsonStateLogger {
  constructor(private baseDir: string = "./results") {}

  async logState(ticker: string, date: string, state: AgentState) {
    const dir = path.join(this.baseDir, ticker);
    await fs.mkdir(dir, { recursive: true });

    const fileName = `${date}_state.json`;
    const filePath = path.join(dir, fileName);

    const data = JSON.stringify(
      state,
      (key, value) => {
        // Filter out overly large fields or non-serializable ones if needed
        if (key === "messages") return undefined;
        return value;
      },
      2,
    );

    await fs.writeFile(filePath, data, "utf-8");
    return filePath;
  }
}
