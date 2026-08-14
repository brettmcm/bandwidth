import type { Metadata } from "next";
import { WorkloadClient } from "./workload-client";

export const metadata: Metadata = {
  title: "Bandwidth",
  description: "A quiet view of official requests, prep windows, and landing dates.",
};

export default function Home() {
  return <WorkloadClient />;
}
