export interface Device {
  udid: string;
  name: string;
  model: string;
  ios: string;
}

/** Port the domain depends on; adapters implement it. */
export interface DevicePort {
  list(): Promise<string[]>;
  describe(udid: string): Promise<Device>;
}
