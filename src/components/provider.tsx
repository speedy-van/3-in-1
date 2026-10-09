"use client";
import { ChakraProvider, createSystem, defaultConfig, defineConfig } from "@chakra-ui/react";
const system = createSystem(defaultConfig, defineConfig({
  theme: { tokens: { colors: {
    ink: { value: "#191C20" }, paper: { value: "#F7F5EF" },
    accent: { value: "#E79A42" }, muted: { value: "#667085" }
  } } },
  globalCss: { body: { margin: 0, background: "paper", color: "ink", fontFamily: "Arial, Helvetica, sans-serif" } }
}));
export function Provider({ children }: { children: React.ReactNode }) {
  return <ChakraProvider value={system}>{children}</ChakraProvider>;
}
