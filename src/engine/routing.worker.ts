import { DataManager } from "./data_manager";
import { RaptorEngine } from "./RaptorEngine";
import type { TransitFilter } from "./types";

let dataManager: DataManager | null = null;
let engine: RaptorEngine | null = null;

self.onmessage = async (e: MessageEvent) => {
  const { type, payload } = e.data;

  switch (type) {
    case "init":
      try {
        if (!dataManager) {
          dataManager = new DataManager();
          await dataManager.init();
          engine = new RaptorEngine(dataManager);
        }
        self.postMessage({ type: "ready" });
      } catch (err: any) {
        self.postMessage({ type: "error", payload: err.message });
      }
      break;

    case "findRoute":
      if (!engine) {
        self.postMessage({ type: "error", payload: "Engine not initialized" });
        break;
      }
      try {
        const { startId, destId, startTime, filter } = payload;
        // explicitly using filter to satisfy lint
        const transitFilter: TransitFilter = filter;
        const results = await engine.findRoute(startId, destId, startTime, transitFilter);
        self.postMessage({ type: "results", payload: results });
      } catch (err: any) {
        self.postMessage({ type: "error", payload: err.message });
      }
      break;

    case "getStops":
      if (!dataManager) {
        self.postMessage({ type: "error", payload: "DataManager not initialized" });
        break;
      }
      self.postMessage({ type: "stops", payload: dataManager.getAllStops() });
      break;

    case "getRoutePath":
      if (!dataManager) {
        self.postMessage({ type: "error", payload: "DataManager not initialized" });
        break;
      }
      const path = dataManager.getRoutePath(payload.busNumber);
      self.postMessage({ type: "routePath", payload: path });
      break;

    case "getStopBusNumbers":
      if (!dataManager) {
        self.postMessage({ type: "error", payload: "DataManager not initialized" });
        break;
      }
      const busNumbers = dataManager.getStopBusNumbers(payload.stopId);
      self.postMessage({ type: "stopBusNumbers", payload: busNumbers });
      break;
  }
};
